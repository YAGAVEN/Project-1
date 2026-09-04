package org.finance.tracker.auth;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import java.util.UUID;

/** Resolves the authenticated user's id from the Supabase JWT (sub claim). */
@Component
public class CurrentUser {

    public UUID requireUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken jwtAuth && jwtAuth.getToken().getSubject() != null) {
            return UUID.fromString(jwtAuth.getToken().getSubject());
        }
        throw new IllegalStateException("No authenticated user on security context");
    }
}
