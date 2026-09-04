package org.finance.tracker.category;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CategoryRepository extends JpaRepository<Category, UUID> {

    List<Category> findByUserIdAndIsActiveTrueOrderByCategoryTypeAscNameAsc(UUID userId);

    List<Category> findByUserIdOrderByCategoryTypeAscNameAsc(UUID userId);

    List<Category> findByUserIdAndCategoryTypeAndIsActiveTrueOrderByNameAsc(UUID userId, CategoryType categoryType);

    List<Category> findByUserIdAndCategoryTypeOrderByNameAsc(UUID userId, CategoryType categoryType);

    Optional<Category> findByIdAndUserId(UUID id, UUID userId);

    boolean existsByUserIdAndParentCategoryIdAndIsActiveTrue(UUID userId, UUID parentCategoryId);

    /** Used by the dev seeder to find seeded defaults by name. */
    Optional<Category> findByUserIdAndCategoryTypeAndNameIgnoreCase(UUID userId, CategoryType categoryType, String name);
}
