package org.finance.tracker.category;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

/**
 * Request/response shapes for /api/v1/categories (backend.md §8.4).
 * Subcategory rules: one parent level only (schema.md §7.2) — enforced in the service.
 */
public final class CategoryDtos {

    private CategoryDtos() {
    }

    public record CreateCategoryRequest(
            @NotBlank @Size(max = 120, message = "Name must be at most 120 characters") String name,
            @NotNull CategoryType categoryType,
            /** Optional — when present it must be a same-type parent with no parent of its own. */
            UUID parentCategoryId) {
    }

    /** PATCH-style PUT: null fields mean "leave unchanged". */
    public record UpdateCategoryRequest(
            @Size(max = 120, message = "Name must be at most 120 characters") String name,
            Boolean isActive) {
    }

    public record CategoryResponse(
            UUID id,
            String name,
            CategoryType categoryType,
            UUID parentCategoryId,
            boolean isActive) {
    }
}
