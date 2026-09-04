package org.finance.tracker.category;

import lombok.RequiredArgsConstructor;
import org.finance.tracker.common.BadRequestException;
import org.finance.tracker.common.ConflictException;
import org.finance.tracker.common.NotFoundException;
import org.finance.tracker.transaction.TransactionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CategoryService {

    private final CategoryRepository categoryRepository;
    private final TransactionRepository transactionRepository;

    @Transactional(readOnly = true)
    public List<Category> list(UUID userId, CategoryType type, boolean includeInactive) {
        if (includeInactive) {
            return type == null
                    ? categoryRepository.findByUserIdOrderByCategoryTypeAscNameAsc(userId)
                    : categoryRepository.findByUserIdAndCategoryTypeOrderByNameAsc(userId, type);
        }
        return type == null
                ? categoryRepository.findByUserIdAndIsActiveTrueOrderByCategoryTypeAscNameAsc(userId)
                : categoryRepository.findByUserIdAndCategoryTypeAndIsActiveTrueOrderByNameAsc(userId, type);
    }

    /** schema.md §7.2 — one parent level: a subcategory cannot have children. */
    @Transactional
    public Category create(UUID userId, CategoryDtos.CreateCategoryRequest request) {
        Category category = new Category();
        category.setUserId(userId);
        category.setName(request.name());
        category.setCategoryType(request.categoryType());

        if (request.parentCategoryId() != null) {
            Category parent = findOwned(userId, request.parentCategoryId());
            if (parent.getCategoryType() != request.categoryType()) {
                throw new BadRequestException(
                        "Subcategory type must match its parent (" + parent.getCategoryType() + ")");
            }
            if (parent.getParentCategoryId() != null) {
                throw new ConflictException("A subcategory cannot have children — only one parent level is allowed");
            }
            category.setParentCategoryId(parent.getId());
        }

        return categoryRepository.save(category);
    }

    @Transactional
    public Category update(UUID userId, UUID categoryId, CategoryDtos.UpdateCategoryRequest request) {
        Category category = findOwned(userId, categoryId);
        if (request.name() != null) {
            category.setName(request.name());
        }
        if (request.isActive() != null) {
            category.setActive(request.isActive());
        }
        return categoryRepository.save(category);
    }

    /** schema.md §18 — deactivate when referenced by transactions or active children, hard delete otherwise. */
    @Transactional
    public void delete(UUID userId, UUID categoryId) {
        Category category = findOwned(userId, categoryId);
        boolean hasActiveChildren =
                categoryRepository.existsByUserIdAndParentCategoryIdAndIsActiveTrue(userId, category.getId());
        boolean referencedByTransactions =
                transactionRepository.existsReferencingCategory(userId, category.getId());
        if (hasActiveChildren || referencedByTransactions) {
            category.setActive(false);
            categoryRepository.save(category);
        } else {
            categoryRepository.delete(category);
        }
    }

    /** Scoped lookup: another user's id must look like a missing one (404, never 403). */
    public Category getOwnedCategory(UUID userId, UUID categoryId) {
        return findOwned(userId, categoryId);
    }

    private Category findOwned(UUID userId, UUID categoryId) {
        return categoryRepository.findByIdAndUserId(categoryId, userId)
                .orElseThrow(() -> NotFoundException.resource("Category"));
    }
}
