package org.finance.tracker.category;

/**
 * 409 — the category (or its subcategories) still has transactions, and no
 * replacement was named. The Settings UI turns the counts into the
 * "pick a replacement" dialog (schema.md §18).
 */
public class CategoryInUseException extends RuntimeException {

    private final long transactionCount;
    private final long subcategoryCount;

    public CategoryInUseException(long transactionCount, long subcategoryCount) {
        super("Category is still in use — name a replacement category to move its transactions to");
        this.transactionCount = transactionCount;
        this.subcategoryCount = subcategoryCount;
    }

    public long getTransactionCount() {
        return transactionCount;
    }

    public long getSubcategoryCount() {
        return subcategoryCount;
    }
}
