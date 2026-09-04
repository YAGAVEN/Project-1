package org.finance.tracker.profile;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public final class ProfileDtos {

    private ProfileDtos() {
    }

    public record ProfileResponse(UUID id, String fullName, String preferredCurrency) {
    }

    public record UpdateProfileRequest(
            @Size(max = 120, message = "Name must be at most 120 characters") String fullName,
            @Pattern(regexp = "INR", message = "Only INR is supported in v1") String preferredCurrency) {
    }
}
