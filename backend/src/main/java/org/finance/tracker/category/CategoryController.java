package org.finance.tracker.category;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.finance.tracker.auth.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/** /api/v1/categories (backend.md §8.4). */
@RestController
@RequestMapping("/api/v1/categories")
@RequiredArgsConstructor
public class CategoryController {

    private final CategoryService categoryService;
    private final CurrentUser currentUser;

    @GetMapping
    List<CategoryDtos.CategoryResponse> list(
            @RequestParam(required = false) CategoryType type,
            @RequestParam(required = false, defaultValue = "false") boolean includeInactive) {
        return categoryService.list(currentUser.requireUserId(), type, includeInactive).stream()
                .map(this::toResponse)
                .toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    CategoryDtos.CategoryResponse create(@Valid @RequestBody CategoryDtos.CreateCategoryRequest request) {
        return toResponse(categoryService.create(currentUser.requireUserId(), request));
    }

    @PutMapping("/{id}")
    CategoryDtos.CategoryResponse update(@PathVariable UUID id,
                                         @Valid @RequestBody CategoryDtos.UpdateCategoryRequest request) {
        return toResponse(categoryService.update(currentUser.requireUserId(), id, request));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID id) {
        categoryService.delete(currentUser.requireUserId(), id);
    }

    private CategoryDtos.CategoryResponse toResponse(Category category) {
        return new CategoryDtos.CategoryResponse(
                category.getId(),
                category.getName(),
                category.getCategoryType(),
                category.getParentCategoryId(),
                category.isActive());
    }
}
