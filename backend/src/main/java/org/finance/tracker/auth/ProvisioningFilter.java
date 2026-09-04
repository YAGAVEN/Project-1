package org.finance.tracker.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.finance.tracker.profile.ProfileService;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Auto-provisions the profiles row (plus default categories) on the user's
 * first authenticated request — backend.md §4.3. Runs after the security
 * filter chain, so the JWT is already validated when it executes.
 */
@Component
@Order(Ordered.LOWEST_PRECEDENCE)
@RequiredArgsConstructor
public class ProvisioningFilter extends OncePerRequestFilter {

    private final ProfileService profileService;
    private final Set<UUID> provisioned = ConcurrentHashMap.newKeySet();

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken jwtAuth) {
            UUID userId = UUID.fromString(jwtAuth.getToken().getSubject());
            if (!provisioned.contains(userId)) {
                profileService.ensureProfile(userId, extractName(jwtAuth.getToken()));
                provisioned.add(userId);
            }
        }
        chain.doFilter(request, response);
    }

    /** Supabase stores the signup name in the user_metadata claim; fall back to name. */
    private String extractName(Jwt jwt) {
        Object metadata = jwt.getClaims().get("user_metadata");
        if (metadata instanceof Map<?, ?> map && map.get("full_name") instanceof String fullName
                && !fullName.isBlank()) {
            return fullName;
        }
        return jwt.getClaimAsString("name");
    }
}
