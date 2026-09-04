package org.finance.tracker.common;

import org.springframework.http.HttpStatus;

/** Base for expected, user-facing errors — mapped to RFC 7807 by GlobalExceptionHandler. */
public abstract class ApiException extends RuntimeException {

    private final HttpStatus status;

    protected ApiException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatus getStatus() {
        return status;
    }
}
