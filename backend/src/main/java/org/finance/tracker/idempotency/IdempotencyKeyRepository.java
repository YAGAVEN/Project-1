package org.finance.tracker.idempotency;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

public interface IdempotencyKeyRepository extends JpaRepository<IdempotencyKey, IdempotencyKey.Id> {

    /**
     * Housekeeping hook: keys older than the retention window can never be
     * replayed anyway (clients expire them long before), so pruning is safe.
     * No scheduler wires this yet — call sites can run it opportunistically.
     */
    @Modifying
    @Query("delete from IdempotencyKey k where k.id.userId = :userId and k.createdAt < :before")
    int deleteByUserIdAndCreatedAtBefore(@Param("userId") UUID userId, @Param("before") Instant before);
}
