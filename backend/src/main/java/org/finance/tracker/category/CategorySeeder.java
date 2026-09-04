package org.finance.tracker.category;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** Seeds the default category set for a new user (schema.md §7.4). */
@Component
@RequiredArgsConstructor
public class CategorySeeder {

    private static final List<String> EXPENSE_CATEGORIES = List.of(
            "Food", "Transport", "Shopping", "Entertainment", "Subscriptions",
            "Education", "Health", "Bills", "Other");

    private static final List<String> INCOME_CATEGORIES = List.of(
            "Salary", "Freelance", "Gift", "Interest", "Other Income");

    private final CategoryRepository categoryRepository;

    @Transactional(propagation = Propagation.REQUIRED)
    public void seedDefaults(UUID userId) {
        List<Category> seeds = new ArrayList<>();
        EXPENSE_CATEGORIES.forEach(name -> seeds.add(newCategory(userId, name, CategoryType.EXPENSE)));
        INCOME_CATEGORIES.forEach(name -> seeds.add(newCategory(userId, name, CategoryType.INCOME)));
        categoryRepository.saveAll(seeds);
    }

    private Category newCategory(UUID userId, String name, CategoryType type) {
        Category category = new Category();
        category.setUserId(userId);
        category.setName(name);
        category.setCategoryType(type);
        return category;
    }
}
