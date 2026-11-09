package org.finance.tracker.contact;

import org.finance.tracker.loan.Loan;
import org.finance.tracker.loan.LoanPaymentRepository;
import org.finance.tracker.loan.LoanRepository;
import org.finance.tracker.loan.LoanStatus;
import org.finance.tracker.loan.LoanType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * Audit Phase 2 (E-9): the per-contact summary must agree with the loan
 * portfolio totals — cancelled loans are mistaken entries, not money owed.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ContactServiceTest {

    private static final UUID USER = UUID.randomUUID();
    private static final UUID CONTACT = UUID.randomUUID();

    @Mock
    private ContactRepository contactRepository;
    @Mock
    private LoanRepository loanRepository;
    @Mock
    private LoanPaymentRepository loanPaymentRepository;

    @InjectMocks
    private ContactService service;

    @BeforeEach
    void setUp() {
        Contact contact = new Contact();
        contact.setId(CONTACT);
        contact.setUserId(USER);
        contact.setName("Arun");
        when(contactRepository.findByIdAndUserId(CONTACT, USER)).thenReturn(Optional.of(contact));
    }

    private Loan loan(UUID id, LoanType type, LoanStatus status, String original) {
        Loan loan = new Loan();
        loan.setId(id);
        loan.setUserId(USER);
        loan.setContactId(CONTACT);
        loan.setLoanType(type);
        loan.setStatus(status);
        loan.setOriginalAmount(new BigDecimal(original));
        return loan;
    }

    @Test
    void summaryExcludesCancelledLoansAndNetsAcrossDirections() {
        UUID lentId = UUID.randomUUID();
        UUID borrowedId = UUID.randomUUID();
        when(loanRepository.findByUserIdAndContactIdAndStatusNot(USER, CONTACT, LoanStatus.CANCELLED))
                .thenReturn(List.of(
                        loan(lentId, LoanType.LENT, LoanStatus.PAID, "5000.00"),
                        loan(borrowedId, LoanType.BORROWED, LoanStatus.ACTIVE, "2000.00")));
        when(loanPaymentRepository.sumByLoanIdIn(List.of(lentId))).thenReturn(new BigDecimal("2000.00"));
        when(loanPaymentRepository.sumByLoanIdIn(List.of(borrowedId))).thenReturn(new BigDecimal("500.00"));

        var summary = service.summary(USER, CONTACT);

        assertThat(summary.totalLent()).isEqualByComparingTo("5000.00");
        assertThat(summary.totalReturned()).isEqualByComparingTo("2000.00");
        assertThat(summary.totalBorrowed()).isEqualByComparingTo("2000.00");
        assertThat(summary.totalRepaid()).isEqualByComparingTo("500.00");
        // receivable 3,000 − payable 1,500
        assertThat(summary.netPending()).isEqualByComparingTo("1500.00");
    }
}
