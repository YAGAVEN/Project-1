package org.finance.tracker.common;

import org.springframework.http.HttpStatus;

/** 409 — business-rule conflict (backend.md §10). */
public class ConflictException extends ApiException {

    public ConflictException(String message) {
        super(HttpStatus.CONFLICT, message);
    }
}
