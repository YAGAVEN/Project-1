package org.finance.tracker.profile;

import lombok.RequiredArgsConstructor;
import org.finance.tracker.category.CategorySeeder;
import org.finance.tracker.common.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ProfileService {

    private final ProfileRepository profileRepository;
    private final CategorySeeder categorySeeder;

    /**
     * Get-or-create the profile for a Supabase user. Creation also seeds the
     * default categories (schema.md §7.4). Idempotent.
     */
    @Transactional
    public Profile ensureProfile(UUID userId, String fullName) {
        return profileRepository.findById(userId).orElseGet(() -> {
            Profile profile = new Profile();
            profile.setId(userId);
            profile.setFullName(fullName);
            profile.setPreferredCurrency("INR");
            Profile saved = profileRepository.save(profile);
            categorySeeder.seedDefaults(userId);
            return saved;
        });
    }

    @Transactional(readOnly = true)
    public Profile getProfile(UUID userId) {
        return profileRepository.findById(userId)
                .orElseThrow(() -> NotFoundException.resource("Profile"));
    }

    @Transactional
    public Profile updateProfile(UUID userId, String fullName, String preferredCurrency) {
        Profile profile = getProfile(userId);
        if (fullName != null) {
            profile.setFullName(fullName);
        }
        if (preferredCurrency != null) {
            profile.setPreferredCurrency(preferredCurrency);
        }
        return profileRepository.save(profile);
    }
}
