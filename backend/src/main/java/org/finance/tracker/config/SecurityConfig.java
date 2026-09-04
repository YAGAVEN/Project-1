package org.finance.tracker.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        return http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(
                                "/actuator/health", "/actuator/health/**",
                                "/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html")
                        .permitAll()
                        .anyRequest().authenticated())
                // §10 — security failures speak RFC 7807 too, not empty bodies
                .oauth2ResourceServer(rs -> rs.jwt(Customizer.withDefaults())
                        .authenticationEntryPoint(unauthorized())
                        .accessDeniedHandler(forbidden()))
                .build();
    }

    private static AuthenticationEntryPoint unauthorized() {
        // parameter types are inferred — AuthenticationEntryPoint.commence takes AuthenticationException
        return (request, response, ex) ->
                writeProblem(request, response, HttpStatus.UNAUTHORIZED, "Missing, invalid, or expired token");
    }

    private static AccessDeniedHandler forbidden() {
        // AccessDeniedHandler.handle takes AccessDeniedException
        return (request, response, ex) ->
                writeProblem(request, response, HttpStatus.FORBIDDEN, "You cannot access this resource");
    }

    private static void writeProblem(HttpServletRequest request, HttpServletResponse response,
                                     HttpStatus status, String detail) throws IOException {

        response.setStatus(status.value());
        response.setContentType("application/problem+json");
        MAPPER.writeValue(response.getWriter(), Map.of(
                "type", "https://finance-tracker/errors/auth",
                "title", status.getReasonPhrase(),
                "status", status.value(),
                "detail", detail,
                "instance", request.getRequestURI()));
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(
            @Value("${app.cors.allowed-origins}") String allowedOrigins) {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of(allowedOrigins.split(",")));
        config.setAllowedMethods(List.of("*"));
        config.setAllowedHeaders(List.of("*"));
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
