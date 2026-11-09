package org.finance.tracker.idempotency;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.finance.tracker.common.BadRequestException;
import org.finance.tracker.common.ConflictException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Audit Phase 2 (H-3): claim/replay semantics. Same key + same payload replays;
 * same key + different payload 409s; concurrent claims collapse on the PK.
 * Serialization uses a JavaTimeModule mapper like Spring Boot's own.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class IdempotencyServiceTest {

    private static final UUID USER = UUID.randomUUID();

    @Mock
    private IdempotencyKeyRepository repository;

    private IdempotencyService service;
    private ObjectMapper mapper;

    @BeforeEach
    void setUp() {
        mapper = new ObjectMapper().registerModule(new JavaTimeModule());
        service = new IdempotencyService(repository, mapper);
    }

    private IdempotencyKey completedClaim(String hash, String body) {
        IdempotencyKey key = new IdempotencyKey();
        key.setId(new IdempotencyKey.Id(USER, "key-1"));
        key.setRequestHash(hash);
        key.setStatus(IdempotencyKey.Status.COMPLETED);
        key.setResponseStatus((short) 201);
        key.setResponseBody(body);
        return key;
    }

    @Test
    void hashIsStableForEqualPayloadsAndDiffersForDifferentOnes() {
        record Body(String name, long amount) {
        }
        String first = service.hashOf(new Body("Lunch", 500));
        String second = service.hashOf(new Body("Lunch", 500));
        String other = service.hashOf(new Body("Lunch", 900));

        assertThat(first).isEqualTo(second).hasSize(64);
        assertThat(first).isNotEqualTo(other);
    }

    @Test
    void completedClaimWithMatchingHashIsReplayable() {
        IdempotencyKey stored = completedClaim(service.hashOf(new Payload()), "{}");
        when(repository.findById(new IdempotencyKey.Id(USER, "key-1"))).thenReturn(Optional.of(stored));

        Optional<IdempotencyKey> claim = service.findReusableClaim(USER, "key-1", stored.getRequestHash());

        assertThat(claim).contains(stored);
    }

    @Test
    void keyReuseWithDifferentPayloadConflicts() {
        IdempotencyKey stored = completedClaim("another-hash", "{}");
        when(repository.findById(new IdempotencyKey.Id(USER, "key-1"))).thenReturn(Optional.of(stored));

        assertThatThrownBy(() -> service.findReusableClaim(USER, "key-1", service.hashOf(new Payload())))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("different request body");
    }

    @Test
    void inFlightClaimConflictsInsteadOfDoubleExecuting() {
        IdempotencyKey pending = new IdempotencyKey();
        pending.setId(new IdempotencyKey.Id(USER, "key-1"));
        pending.setRequestHash(service.hashOf(new Payload()));
        pending.setStatus(IdempotencyKey.Status.PENDING);
        when(repository.findById(new IdempotencyKey.Id(USER, "key-1"))).thenReturn(Optional.of(pending));

        assertThatThrownBy(() -> service.findReusableClaim(USER, "key-1", pending.getRequestHash()))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("still in progress");
    }

    @Test
    void claimPersistsPendingRowScopedToTheUser() {
        service.claim(USER, "key-1", "hash");

        ArgumentCaptor<IdempotencyKey> captor = ArgumentCaptor.forClass(IdempotencyKey.class);
        verify(repository).save(captor.capture());
        IdempotencyKey saved = captor.getValue();
        assertThat(saved.getId().getUserId()).isEqualTo(USER);
        assertThat(saved.getId().getKey()).isEqualTo("key-1");
        assertThat(saved.getRequestHash()).isEqualTo("hash");
        assertThat(saved.getStatus()).isEqualTo(IdempotencyKey.Status.PENDING);
    }

    @Test
    void blankAndOversizedKeysAreRejectedAsBadRequest() {
        assertThatThrownBy(() -> service.claim(USER, "  ", "hash"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("blank");
        assertThatThrownBy(() -> service.claim(USER, "k".repeat(256), "hash"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("255");
    }

    @Test
    void completeSerializesResponseAndMarksRowCompleted() {
        IdempotencyKey claim = new IdempotencyKey();
        claim.setId(new IdempotencyKey.Id(USER, "key-1"));
        claim.setRequestHash("hash");

        service.complete(claim, 201, new Payload());

        ArgumentCaptor<IdempotencyKey> captor = ArgumentCaptor.forClass(IdempotencyKey.class);
        verify(repository).save(captor.capture());
        IdempotencyKey saved = captor.getValue();
        assertThat(saved.getStatus()).isEqualTo(IdempotencyKey.Status.COMPLETED);
        assertThat(saved.getResponseStatus()).isEqualTo((short) 201);
        assertThat(saved.getResponseBody()).contains("\"amount\":500.00");
    }

    @Test
    void readResponseRoundTripsTheStoredTransactionResponse() throws Exception {
        String json = mapper.writeValueAsString(new Payload());
        IdempotencyKey stored = completedClaim("hash", json);

        Payload restored = service.readResponse(stored, Payload.class);

        assertThat(restored.name).isEqualTo("Lunch");
        assertThat(restored.amount).isEqualByComparingTo("500.00");
        assertThat(restored.date).isEqualTo(LocalDate.of(2026, 9, 4));
    }

    /** Shape-compatible stand-in for TransactionResponse (BigDecimal/date fields included). */
    record Payload(String name, BigDecimal amount, LocalDate date) {
        Payload() {
            this("Lunch", new BigDecimal("500.00"), LocalDate.of(2026, 9, 4));
        }
    }
}
