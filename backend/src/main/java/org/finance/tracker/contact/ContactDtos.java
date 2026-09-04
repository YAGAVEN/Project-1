package org.finance.tracker.contact;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.UUID;

/** Request/response shapes for /api/v1/contacts (backend.md §8.7). */
public final class ContactDtos {

    private ContactDtos() {
    }

    public record CreateContactRequest(
            @NotBlank @Size(max = 120, message = "Name must be at most 120 characters") String name,
            @Size(max = 500, message = "Notes must be at most 500 characters") String notes) {
    }

    /** PATCH-style PUT: null fields mean "leave unchanged". */
    public record UpdateContactRequest(
            @Size(max = 120, message = "Name must be at most 120 characters") String name,
            @Size(max = 500, message = "Notes must be at most 500 characters") String notes) {
    }

    public record ContactResponse(UUID id, String name, String notes) {
    }

    /** Per-contact derived summary (§8.7) — positive netPending = they owe you. */
    public record ContactSummaryResponse(
            UUID contactId,
            String name,
            BigDecimal totalLent,
            BigDecimal totalReturned,
            BigDecimal totalBorrowed,
            BigDecimal totalRepaid,
            BigDecimal netPending) {
    }
}
