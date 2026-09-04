package org.finance.tracker.account;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AccountRepository extends JpaRepository<Account, UUID> {

    List<Account> findByUserIdAndIsActiveTrueOrderByNameAsc(UUID userId);

    Optional<Account> findByIdAndUserId(UUID id, UUID userId);
}
