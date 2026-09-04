package org.finance.tracker.profile;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.Instant;
import java.util.UUID;

/**
 * Application data for one Supabase auth user. The id is assigned from the
 * JWT sub claim — it mirrors auth.users.id (schema.md §5).
 */
@Entity
@Table(name = "profiles")
@Getter
@Setter
@NoArgsConstructor
@EntityListeners(AuditingEntityListener.class)
public class Profile {

    @Id
    private UUID id;

    @Column(name = "full_name", length = 120)
    private String fullName;

    @Column(name = "preferred_currency", nullable = false, length = 8)
    private String preferredCurrency;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
