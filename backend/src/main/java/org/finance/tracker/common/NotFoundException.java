package org.finance.tracker.common;

import org.springframework.http.HttpStatus;

/** 404 — resource does not exist for this user. */
public class NotFoundException extends ApiException {

    public NotFoundException(String message) {
        super(HttpStatus.NOT_FOUND, message);
    }

    public static NotFoundException resource(String resource) {
        return new NotFoundException(resource + " not found");
    }
}
