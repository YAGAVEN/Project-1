package org.finance.tracker.idempotency;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

import static jakarta.persistence.EnumType.STRING;

/**
 * Server-side record of one client-generated idempotency key (audit Phase 2,
 * V4__idempotency_keys). A repeated (user, key) pair replays the stored
 * response instead of re-executing the financial write; a repeated key with a
 * different payload is rejected.
 */
@Entity
@Table(name = "idempotency_keys")
@Getter
@Setter
@NoArgsConstructor
public class IdempotencyKey {

    public enum Status {
        PENDING, COMPLETED
    }

    @Embeddable
    @Getter
    @Setter
    @NoArgsConstructor
    @EqualsAndHashCode
    public static class Id {
        @Column(name = "user_id", nullable = false)
        private UUID userId;

        @Column(name = "idempotency_key", nullable = false, length = 255)
        private String key;

        public Id(UUID userId, String key) {
            this.userId = userId;
            this.key = key;
        }
    }

    @EmbeddedId
    private Id id;

    @Column(name = "request_hash", nullable = false, length = 64)
    private String requestHash;

    @Enumerated(STRING)
    @Column(nullable = false, length = 12)
    private Status status = Status.PENDING;

    @Column(name = "response_status")
    private Short responseStatus;

    @Column(name = "response_body")
    private String responseBody;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();
}
