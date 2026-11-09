package org.finance.tracker.account;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.constraints.Positive;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Audit Phase 2 (E-9): credit limits must be positive — the audit found
 * negative limits accepted because @Digits alone does not constrain sign.
 */
class AccountDtosValidationTest {

    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void setUp() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void tearDown() {
        factory.close();
    }

    private static boolean hasPositiveViolation(Set<? extends ConstraintViolation<?>> violations) {
        return violations.stream().anyMatch(v ->
                v.getConstraintDescriptor().getAnnotation().annotationType() == Positive.class);
    }

    @Test
    void negativeCreditLimitIsRejected() {
        Set<ConstraintViolation<AccountDtos.CreateAccountRequest>> violations = validator.validate(
                new AccountDtos.CreateAccountRequest("Card", AccountType.CREDIT_CARD,
                        BigDecimal.ZERO, new BigDecimal("-5000"), (short) 5, (short) 23));

        assertThat(hasPositiveViolation(violations)).isTrue();
    }

    @Test
    void zeroCreditLimitIsRejected() {
        Set<ConstraintViolation<AccountDtos.CreateAccountRequest>> violations = validator.validate(
                new AccountDtos.CreateAccountRequest("Card", AccountType.CREDIT_CARD,
                        BigDecimal.ZERO, BigDecimal.ZERO, (short) 5, (short) 23));

        assertThat(hasPositiveViolation(violations)).isTrue();
    }

    @Test
    void positiveCreditLimitPasses() {
        Set<ConstraintViolation<AccountDtos.CreateAccountRequest>> violations = validator.validate(
                new AccountDtos.CreateAccountRequest("Card", AccountType.CREDIT_CARD,
                        BigDecimal.ZERO, new BigDecimal("100000.00"), (short) 5, (short) 23));

        assertThat(violations).isEmpty();
    }

    @Test
    void updateRequestRejectsNegativeCreditLimitToo() {
        Set<ConstraintViolation<AccountDtos.UpdateAccountRequest>> violations = validator.validate(
                new AccountDtos.UpdateAccountRequest(null, null, new BigDecimal("-1"), null, null, null));

        assertThat(violations).isNotEmpty();
        assertThat(violations).anyMatch(v ->
                v.getConstraintDescriptor().getAnnotation().annotationType() == Positive.class);
    }
}
