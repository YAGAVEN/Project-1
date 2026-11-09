package org.finance.tracker.idempotency;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.finance.tracker.common.BadRequestException;
import org.finance.tracker.common.ConflictException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;

/**
 * Claim/replay engine for Idempotency-Key (audit Phase 2, acceptance: the
 * same key never creates a second financial record). All reads/writes here
 * join the CALLER's transaction, so the claim insert, the financial write,
 * and the response capture commit or roll back atomically — a crashed
 * request leaves no claim and can be retried cleanly.
 *
 * Concurrency: two requests racing the same key both pass the "absent" check
 * (READ COMMITTED), and the second INSERT fails on the composite PK — the
 * request dies as a 409 via the DataIntegrityViolation handler and the
 * client retries. Exactly one execution ever commits.
 */
@Service
@RequiredArgsConstructor
public class IdempotencyService {

    private final IdempotencyKeyRepository repository;
    private final ObjectMapper objectMapper;

    /** sha-256 of the canonical serialized body — detects key reuse with a different payload. */
    public String hashOf(Object requestBody) {
        try {
            byte[] canonical = objectMapper.writeValueAsBytes(requestBody);
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(canonical));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        } catch (Exception e) {
            throw new IllegalArgumentException("Request body could not be hashed", e);
        }
    }

    /**
     * Returns the claim row when this key was already used. Throws 409 when
     * the reuse carries a different payload or an identical request is still
     * in flight; callers replay the stored response for a completed match.
     */
    public Optional<IdempotencyKey> findReusableClaim(UUID userId, String key, String requestHash) {
        return repository.findById(new IdempotencyKey.Id(userId, key))
                .map(existing -> {
                    if (!existing.getRequestHash().equals(requestHash)) {
                        throw new ConflictException(
                                "Idempotency-Key was already used with a different request body");
                    }
                    if (existing.getStatus() == IdempotencyKey.Status.PENDING) {
                        throw new ConflictException(
                                "An identical request with this Idempotency-Key is still in progress");
                    }
                    return existing;
                });
    }

    /**
     * Inserts the PENDING claim inside the caller's transaction. Validates
     * the key shape first so column limits surface as 400, not SQL errors.
     */
    public IdempotencyKey claim(UUID userId, String key, String requestHash) {
        if (key.isBlank()) {
            throw new BadRequestException("Idempotency-Key must not be blank");
        }
        if (key.length() > 255) {
            throw new BadRequestException("Idempotency-Key must be at most 255 characters");
        }
        IdempotencyKey claim = new IdempotencyKey();
        claim.setId(new IdempotencyKey.Id(userId, key));
        claim.setRequestHash(requestHash);
        claim.setStatus(IdempotencyKey.Status.PENDING);
        return repository.save(claim);
    }

    /** Captures the response on the SAME claim row and marks it COMPLETED — atomic with the write. */
    public void complete(IdempotencyKey claim, int responseStatus, Object responseBody) {
        try {
            claim.setResponseStatus((short) responseStatus);
            claim.setResponseBody(objectMapper.writeValueAsString(responseBody));
            claim.setStatus(IdempotencyKey.Status.COMPLETED);
            repository.save(claim);
        } catch (Exception e) {
            // Serialization failure must abort the whole transaction, otherwise
            // the write commits with a claim that can never replay.
            throw new IllegalStateException("Could not capture idempotent response", e);
        }
    }

    /** Rebuilds the stored response. Read-only — the replay path never writes. */
    @Transactional(readOnly = true, propagation = Propagation.SUPPORTS)
    public <T> T readResponse(IdempotencyKey claim, Class<T> responseType) {
        try {
            return objectMapper.readValue(claim.getResponseBody(), responseType);
        } catch (Exception e) {
            throw new IllegalStateException("Stored idempotent response is unreadable", e);
        }
    }
}
