package org.finance.tracker.category;

import lombok.RequiredArgsConstructor;
import org.finance.tracker.budget.BudgetRepository;
import org.finance.tracker.common.BadRequestException;
import org.finance.tracker.common.ConflictException;
import org.finance.tracker.common.NotFoundException;
import org.finance.tracker.transaction.TransactionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CategoryService {

    private final CategoryRepository categoryRepository;
    private final TransactionRepository transactionRepository;
    private final BudgetRepository budgetRepository;

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

    /**
     * schema.md §18 — a category is always hard-deleted, never left inactive.
     * Unused (no transactions anywhere in its subtree, no subcategories) it
     * deletes directly. Used, it must name a replacement: every transaction of
     * the category and its subcategories remaps there, its subcategories and
     * budget templates are removed, then the category itself is deleted.
     * Without a replacement a used category answers 409 with usage counts so
     * the UI can ask which category should be used instead.
     */
    @Transactional
    public void delete(UUID userId, UUID categoryId, UUID replacementCategoryId) {
        Category category = findOwned(userId, categoryId);
        List<Category> children = categoryRepository.findByUserIdAndParentCategoryId(userId, category.getId());

        List<UUID> removedIds = new ArrayList<>();
        removedIds.add(category.getId());
        children.forEach(child -> removedIds.add(child.getId()));

        long transactionCount = transactionRepository.countByUserIdAndCategoryIdIn(userId, removedIds);
        if (transactionCount == 0 && children.isEmpty()) {
            categoryRepository.delete(category);
            return;
        }

        if (replacementCategoryId == null) {
            throw new CategoryInUseException(transactionCount, children.size());
        }

        Category replacement = findOwned(userId, replacementCategoryId);
        if (replacement.getId().equals(category.getId())) {
            throw new BadRequestException("The replacement must be a different category");
        }
        if (replacement.getCategoryType() != category.getCategoryType()) {
            throw new BadRequestException(
                    "Replacement must be a " + category.getCategoryType() + " category");
        }
        if (!replacement.isActive()) {
            throw new BadRequestException("Replacement category '" + replacement.getName() + "' is deactivated");
        }
        if (children.stream().anyMatch(child -> child.getId().equals(replacement.getId()))) {
            throw new BadRequestException("Cannot remap to a subcategory that is being deleted");
        }

        transactionRepository.remapCategoryTo(userId, removedIds, replacement.getId());
        budgetRepository.deleteAll(budgetRepository.findAllByUserIdAndCategoryIdIn(userId, removedIds));
        categoryRepository.deleteAll(children);
        categoryRepository.delete(category);
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
