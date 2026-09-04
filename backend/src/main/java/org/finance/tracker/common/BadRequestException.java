package org.finance.tracker.common;

import org.springframework.http.HttpStatus;

/** 400 — malformed request or violated business rule (backend.md §10). */
public class BadRequestException extends ApiException {

    public BadRequestException(String message) {
        super(HttpStatus.BAD_REQUEST, message);
    }
}
