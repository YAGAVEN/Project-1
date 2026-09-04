package org.finance.tracker.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtDecoders;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.SupplierJwtDecoder;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;

/**
 * Two supported token-validation modes (backend.md §4.2):
 *
 * 1. Preferred — asymmetric signing keys enabled in the Supabase dashboard:
 *    set SUPABASE_ISSUER to https://<project-ref>.supabase.co/auth/v1
 *    The JWKS document is fetched lazily on the first request.
 *
 * 2. Legacy — projects still signing with the HS256 shared secret:
 *    set SUPABASE_JWT_SECRET instead.
 */
@Slf4j
@Configuration
public class JwtDecoderConfig {

    @Bean
    JwtDecoder jwtDecoder(
            @Value("${spring.security.oauth2.resourceserver.jwt.issuer-uri:}") String issuerUri,
            @Value("${app.jwt.secret:}") String secret) {

        if (!issuerUri.isBlank()) {
            log.info("JWT validation mode: issuer ({})", issuerUri);
            // Lazy so startup does not require Supabase to be reachable
            return new SupplierJwtDecoder(() -> {
                NimbusJwtDecoder decoder = JwtDecoders.fromIssuerLocation(issuerUri);
                decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(issuerUri));
                return decoder;
            });
        }

        if (!secret.isBlank()) {
            log.info("JWT validation mode: legacy HS256 secret");
            SecretKey key = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            return NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
        }

        throw new IllegalStateException(
                "No JWT configuration found. Set SUPABASE_ISSUER (preferred) "
                        + "or SUPABASE_JWT_SECRET (legacy HS256) — see backend/README.md");
    }
}
