package org.finance.tracker.common;

import org.springframework.data.domain.Page;

import java.util.List;

/** Standard paginated list envelope: { content, page, size, totalElements } (backend.md §8.1). */
public record PageResponse<T>(List<T> content, int page, int size, long totalElements) {

    public static <T> PageResponse<T> from(Page<T> page) {
        return new PageResponse<>(page.getContent(), page.getNumber(), page.getSize(), page.getTotalElements());
    }
}
