package org.finance.tracker.profile;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.finance.tracker.auth.CurrentUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/me")
@RequiredArgsConstructor
public class ProfileController {

    private final ProfileService profileService;
    private final CurrentUser currentUser;

    @GetMapping
    ProfileDtos.ProfileResponse me() {
        var profile = profileService.ensureProfile(currentUser.requireUserId(), null);
        return toResponse(profile);
    }

    @PutMapping
    ProfileDtos.ProfileResponse update(@Valid @RequestBody ProfileDtos.UpdateProfileRequest request) {
        var profile = profileService.updateProfile(
                currentUser.requireUserId(), request.fullName(), request.preferredCurrency());
        return toResponse(profile);
    }

    private ProfileDtos.ProfileResponse toResponse(Profile profile) {
        return new ProfileDtos.ProfileResponse(
                profile.getId(), profile.getFullName(), profile.getPreferredCurrency());
    }
}
