package org.finance.tracker.loan;

import org.finance.tracker.account.Account;
import org.finance.tracker.account.AccountRepository;
import org.finance.tracker.account.AccountService;
import org.finance.tracker.account.AccountType;
import org.finance.tracker.common.BadRequestException;
import org.finance.tracker.contact.Contact;
import org.finance.tracker.contact.ContactRepository;
import org.finance.tracker.contact.ContactService;
import org.finance.tracker.transaction.Transaction;
import org.finance.tracker.transaction.TransactionRepository;
import org.finance.tracker.transaction.TransactionType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The §9.3 loan paths: repayment creates the right LOAN_* transaction, the
 * status flips exactly at zero, and overpayment is rejected.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class LoanServicePaymentTest {

    private static final UUID USER = UUID.randomUUID();
    private static final LocalDate TODAY = LocalDate.of(2026, 9, 4);

    @Mock
    private LoanRepository loanRepository;
    @Mock
    private LoanPaymentRepository loanPaymentRepository;
    @Mock
    private TransactionRepository transactionRepository;
    @Mock
    private ContactService contactService;
    @Mock
    private ContactRepository contactRepository;
    @Mock
    private AccountService accountService;
    @Mock
    private AccountRepository accountRepository;

    @InjectMocks
    private LoanService service;

    private Account bank;
    private Contact contact;
    private Loan lentLoan;
    private Transaction originTxn;

    @BeforeEach
    void setUp() {
        bank = new Account();
        bank.setId(UUID.randomUUID());
        bank.setUserId(USER);
        bank.setName("HDFC Bank");
        bank.setAccountType(AccountType.BANK);
        bank.setActive(true);

        contact = new Contact();
        contact.setId(UUID.randomUUID());
        contact.setUserId(USER);
        contact.setName("Arun");

        lentLoan = new Loan();
        lentLoan.setId(UUID.randomUUID());
        lentLoan.setUserId(USER);
        lentLoan.setContactId(contact.getId());
        lentLoan.setLoanType(LoanType.LENT);
        lentLoan.setOriginalAmount(new BigDecimal("5000.00"));
        lentLoan.setTransactionId(UUID.randomUUID());
        lentLoan.setStartDate(TODAY);
        lentLoan.setStatus(LoanStatus.ACTIVE);

        originTxn = new Transaction();
        originTxn.setId(lentLoan.getTransactionId());
        originTxn.setUserId(USER);
        originTxn.setTransactionType(TransactionType.LOAN_GIVEN);
        originTxn.setFromAccountId(bank.getId());

        when(loanRepository.findByIdAndUserId(lentLoan.getId(), USER)).thenReturn(Optional.of(lentLoan));
        when(accountService.getOwnedAccount(USER, bank.getId())).thenReturn(bank);
        when(transactionRepository.save(any())).thenAnswer(invocation -> {
            Transaction saved = invocation.getArgument(0);
            saved.setId(UUID.randomUUID());
            return saved;
        });
        when(loanPaymentRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(transactionRepository.findById(lentLoan.getTransactionId())).thenReturn(Optional.of(originTxn));
        when(contactRepository.findAllById(any())).thenReturn(List.of(contact));
        when(accountRepository.findAllById(any())).thenReturn(List.of(bank));
    }

    @Test
    void overpaymentIsRejected() {
        when(loanPaymentRepository.sumByLoanId(lentLoan.getId())).thenReturn(new BigDecimal("3000.00"));

        assertThatThrownBy(() -> service.recordPayment(USER, lentLoan.getId(),
                new LoanDtos.CreatePaymentRequest(new BigDecimal("3000.00"), TODAY, bank.getId())))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void finalPaymentCreatesRepaymentInAndFlipsLoanToPaid() {
        // outstanding 3000; paying exactly that reaches zero
        when(loanPaymentRepository.sumByLoanId(lentLoan.getId())).thenReturn(new BigDecimal("2000.00"));
        when(loanPaymentRepository.findByLoanIdOrderByPaymentDateAsc(lentLoan.getId()))
                .thenReturn(List.of(payment(new BigDecimal("2000.00"))));

        service.recordPayment(USER, lentLoan.getId(),
                new LoanDtos.CreatePaymentRequest(new BigDecimal("3000.00"), TODAY, bank.getId()));

        ArgumentCaptor<Transaction> txnCaptor = ArgumentCaptor.forClass(Transaction.class);
        verify(transactionRepository).save(txnCaptor.capture());
        Transaction repayment = txnCaptor.getValue();
        assertThat(repayment.getTransactionType()).isEqualTo(TransactionType.LOAN_REPAYMENT_IN);
        assertThat(repayment.getToAccountId()).isEqualTo(bank.getId());
        assertThat(repayment.getFromAccountId()).isNull();

        ArgumentCaptor<Loan> loanCaptor = ArgumentCaptor.forClass(Loan.class);
        verify(loanRepository).save(loanCaptor.capture());
        assertThat(loanCaptor.getValue().getStatus()).isEqualTo(LoanStatus.PAID);
    }

    @Test
    void deletingAPaymentOnAPaidLoanReopensIt() {
        lentLoan.setStatus(LoanStatus.PAID);
        LoanPayment payment = payment(new BigDecimal("2000.00"));
        when(loanPaymentRepository.findByIdAndLoanId(payment.getId(), lentLoan.getId()))
                .thenReturn(Optional.of(payment));
        // after the delete, remaining payments total 3000 → outstanding > 0
        when(loanPaymentRepository.sumByLoanId(lentLoan.getId())).thenReturn(new BigDecimal("3000.00"));

        service.deletePayment(USER, lentLoan.getId(), payment.getId());

        verify(transactionRepository).deleteById(payment.getTransactionId());
        verify(loanPaymentRepository).delete(payment);
        ArgumentCaptor<Loan> loanCaptor = ArgumentCaptor.forClass(Loan.class);
        verify(loanRepository).save(loanCaptor.capture());
        assertThat(loanCaptor.getValue().getStatus()).isEqualTo(LoanStatus.ACTIVE);
    }

    private LoanPayment payment(BigDecimal amount) {
        LoanPayment payment = new LoanPayment();
        payment.setId(UUID.randomUUID());
        payment.setLoanId(lentLoan.getId());
        payment.setTransactionId(UUID.randomUUID());
        payment.setAmount(amount);
        payment.setPaymentDate(TODAY);
        return payment;
    }
}
