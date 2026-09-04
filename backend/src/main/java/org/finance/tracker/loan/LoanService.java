package org.finance.tracker.loan;

import lombok.RequiredArgsConstructor;
import org.finance.tracker.account.Account;
import org.finance.tracker.account.AccountRepository;
import org.finance.tracker.account.AccountService;
import org.finance.tracker.account.AccountType;
import org.finance.tracker.common.BadRequestException;
import org.finance.tracker.common.ConflictException;
import org.finance.tracker.common.NotFoundException;
import org.finance.tracker.contact.Contact;
import org.finance.tracker.contact.ContactRepository;
import org.finance.tracker.contact.ContactService;
import org.finance.tracker.transaction.Transaction;
import org.finance.tracker.transaction.TransactionRepository;
import org.finance.tracker.transaction.TransactionType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Loans + repayments (backend.md §8.7). Every path here writes TWO tables and
 * is therefore @Transactional (§9.3): the origin/repayment transaction and the
 * loan/payment row live or die together — plan invariants 3 and 7.
 */
@Service
@RequiredArgsConstructor
public class LoanService {

    private final LoanRepository loanRepository;
    private final LoanPaymentRepository loanPaymentRepository;
    private final TransactionRepository transactionRepository;
    private final ContactService contactService;
    private final ContactRepository contactRepository;
    private final AccountService accountService;
    private final AccountRepository accountRepository;

    // ---- loans -------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<LoanDtos.LoanResponse> list(UUID userId, LoanType direction, LoanStatus status) {
        List<Loan> loans = loanRepository.findByUserIdOrderByStartDateDesc(userId).stream()
                .filter(loan -> direction == null || loan.getLoanType() == direction)
                .filter(loan -> status == null || loan.getStatus() == status)
                .toList();

        Set<UUID> loanIds = new HashSet<>();
        Set<UUID> transactionIds = new HashSet<>();
        Set<UUID> contactIds = new HashSet<>();
        for (Loan loan : loans) {
            loanIds.add(loan.getId());
            transactionIds.add(loan.getTransactionId());
            contactIds.add(loan.getContactId());
        }
        Map<UUID, BigDecimal> paidByLoan = loanPaymentRepository.paidTotalsByLoanId(loanIds);
        Map<UUID, Transaction> originTxns = transactionsById(transactionIds);
        Map<UUID, String> contactNames = contactNames(contactIds);
        Map<UUID, String> accountNames = accountNames(accountIdsOf(originTxns.values()));

        return loans.stream()
                .map(loan -> toListResponse(loan, paidByLoan, originTxns, contactNames, accountNames))
                .toList();
    }

    /** §9.3 — origin transaction + loan row written in ONE transaction. */
    @Transactional
    public LoanDtos.LoanResponse create(UUID userId, LoanDtos.CreateLoanRequest request) {
        Contact contact = contactService.getOwnedContact(userId, request.contactId());
        Account account = requireAccount(userId, request.accountId());

        Transaction origin = new Transaction();
        origin.setUserId(userId);
        origin.setAmount(request.amount());
        origin.setTransactionDate(request.loanDate());
        origin.setDescription(request.description());
        if (request.loanType() == LoanType.LENT) {
            // §8.7 — LENT → LOAN_GIVEN from accountId: cash leaves the account
            origin.setTransactionType(TransactionType.LOAN_GIVEN);
            origin.setFromAccountId(account.getId());
        } else {
            // BORROWED → LOAN_RECEIVED to accountId: money enters the account
            origin.setTransactionType(TransactionType.LOAN_RECEIVED);
            origin.setToAccountId(account.getId());
        }
        Transaction savedOrigin = transactionRepository.save(origin);

        Loan loan = new Loan();
        loan.setUserId(userId);
        loan.setContactId(contact.getId());
        loan.setLoanType(request.loanType());
        loan.setOriginalAmount(request.amount());
        loan.setTransactionId(savedOrigin.getId());
        loan.setStartDate(request.loanDate());
        loan.setStatus(LoanStatus.ACTIVE);
        loan.setDescription(request.description());
        loanRepository.save(loan);

        return toResponse(loan, List.of());
    }

    /** §8.7 detail — original, outstanding, payment timeline. */
    @Transactional(readOnly = true)
    public LoanDtos.LoanResponse detail(UUID userId, UUID loanId) {
        Loan loan = findOwned(userId, loanId);
        return toResponse(loan, loanPaymentRepository.findByLoanIdOrderByPaymentDateAsc(loanId));
    }

    /** §7 — description/contact only; amount has no setter here: immutable by design. */
    @Transactional
    public LoanDtos.LoanResponse update(UUID userId, UUID loanId, LoanDtos.UpdateLoanRequest request) {
        Loan loan = findOwned(userId, loanId);
        if (request.contactId() != null) {
            Contact contact = contactService.getOwnedContact(userId, request.contactId());
            loan.setContactId(contact.getId());
        }
        if (request.description() != null) {
            loan.setDescription(request.description());
        }
        loanRepository.save(loan);
        return toResponse(loan, loanPaymentRepository.findByLoanIdOrderByPaymentDateAsc(loanId));
    }

    /** schema.md §18 — hard delete (loan + origin transaction, atomically) only while unpaid. */
    @Transactional
    public void delete(UUID userId, UUID loanId) {
        Loan loan = findOwned(userId, loanId);
        if (loanPaymentRepository.existsByLoanId(loanId)) {
            throw new ConflictException("Cannot delete a loan that has payments — remove the payments first");
        }
        transactionRepository.deleteById(loan.getTransactionId());
        loanRepository.delete(loan);
    }

    // ---- repayments (§9.3 atomic paths) -------------------------------------

    /** Repayment transaction + payment row together; status flips to PAID at zero (§6.6). */
    @Transactional
    public LoanDtos.LoanResponse recordPayment(UUID userId, UUID loanId, LoanDtos.CreatePaymentRequest request) {
        Loan loan = findOwned(userId, loanId);
        Account account = requireAccount(userId, request.accountId());

        BigDecimal outstanding = outstandingOf(loan);
        if (request.amount().compareTo(outstanding) > 0) {
            throw new BadRequestException("Payment of " + request.amount()
                    + " exceeds the outstanding " + outstanding);
        }

        Transaction repayment = new Transaction();
        repayment.setUserId(userId);
        repayment.setAmount(request.amount());
        repayment.setTransactionDate(request.paymentDate());
        repayment.setDescription("Loan repayment");
        if (loan.getLoanType() == LoanType.LENT) {
            // §8.7 — LENT loan repaid: money returns → LOAN_REPAYMENT_IN into accountId
            repayment.setTransactionType(TransactionType.LOAN_REPAYMENT_IN);
            repayment.setToAccountId(account.getId());
        } else {
            // BORROWED loan repaid: money leaves → LOAN_REPAYMENT_OUT from accountId
            repayment.setTransactionType(TransactionType.LOAN_REPAYMENT_OUT);
            repayment.setFromAccountId(account.getId());
        }
        transactionRepository.save(repayment);

        LoanPayment payment = new LoanPayment();
        payment.setLoanId(loan.getId());
        payment.setTransactionId(repayment.getId());
        payment.setAmount(request.amount());
        payment.setPaymentDate(request.paymentDate());
        loanPaymentRepository.save(payment);

        if (outstanding.subtract(request.amount()).compareTo(BigDecimal.ZERO) == 0) {
            loan.setStatus(LoanStatus.PAID);
            loanRepository.save(loan);
        }

        // Hibernate auto-flushes before this query, so the timeline includes the new payment
        return toResponse(loan, loanPaymentRepository.findByLoanIdOrderByPaymentDateAsc(loanId));
    }

    /** Removes a mistaken payment + its transaction; loan status recomputed (may leave PAID). */
    @Transactional
    public void deletePayment(UUID userId, UUID loanId, UUID paymentId) {
        Loan loan = findOwned(userId, loanId);
        LoanPayment payment = loanPaymentRepository.findByIdAndLoanId(paymentId, loanId)
                .orElseThrow(() -> NotFoundException.resource("Loan payment"));

        transactionRepository.deleteById(payment.getTransactionId());
        loanPaymentRepository.delete(payment);

        if (loan.getStatus() == LoanStatus.PAID && outstandingOf(loan).compareTo(BigDecimal.ZERO) > 0) {
            loan.setStatus(LoanStatus.ACTIVE);
            loanRepository.save(loan);
        }
    }

    /** §6.6 — Σ outstanding of ACTIVE loans, split by direction; feeds the dashboard. */
    @Transactional(readOnly = true)
    public LoanDtos.PortfolioTotals portfolioTotals(UUID userId) {
        List<Loan> activeLoans = loanRepository.findByUserIdAndStatus(userId, LoanStatus.ACTIVE);
        Set<UUID> loanIds = new HashSet<>();
        for (Loan loan : activeLoans) {
            loanIds.add(loan.getId());
        }
        Map<UUID, BigDecimal> paidByLoan = loanPaymentRepository.paidTotalsByLoanId(loanIds);

        BigDecimal receivable = BigDecimal.ZERO;
        BigDecimal payable = BigDecimal.ZERO;
        for (Loan loan : activeLoans) {
            BigDecimal outstanding = loan.getOriginalAmount()
                    .subtract(paidByLoan.getOrDefault(loan.getId(), BigDecimal.ZERO));
            if (loan.getLoanType() == LoanType.LENT) {
                receivable = receivable.add(outstanding);
            } else {
                payable = payable.add(outstanding);
            }
        }
        return new LoanDtos.PortfolioTotals(receivable, payable);
    }

    // ---- helpers -------------------------------------------------------------

    private Account requireAccount(UUID userId, UUID accountId) {
        Account account = accountService.getOwnedAccount(userId, accountId);
        if (!account.isActive()) {
            throw new BadRequestException("Account '" + account.getName() + "' is deactivated");
        }
        // §9.1 — lending from a card is a cash advance; money entering a card is a
        // bill payment (modeled as TRANSFER). Both are out of v1 scope.
        if (account.getAccountType() == AccountType.CREDIT_CARD) {
            throw new BadRequestException("Loans cannot involve a credit card account");
        }
        return account;
    }

    private BigDecimal outstandingOf(Loan loan) {
        return loan.getOriginalAmount().subtract(loanPaymentRepository.sumByLoanId(loan.getId()));
    }

    private Loan findOwned(UUID userId, UUID loanId) {
        return loanRepository.findByIdAndUserId(loanId, userId)
                .orElseThrow(() -> NotFoundException.resource("Loan"));
    }

    /** Single-loan mapping (create/detail/update/payment) — resolves names from ids. */
    private LoanDtos.LoanResponse toResponse(Loan loan, List<LoanPayment> payments) {
        Transaction origin = transactionRepository.findById(loan.getTransactionId()).orElse(null);
        UUID accountId = origin == null ? null
                : (origin.getFromAccountId() != null ? origin.getFromAccountId() : origin.getToAccountId());
        Map<UUID, String> contactNames = contactNames(Set.of(loan.getContactId()));
        Map<UUID, String> accountNames = accountNames(accountId == null ? Set.of() : Set.of(accountId));

        BigDecimal paid = BigDecimal.ZERO;
        List<LoanDtos.PaymentResponse> paymentRows = new java.util.ArrayList<>();
        for (LoanPayment payment : payments) {
            paid = paid.add(payment.getAmount());
            paymentRows.add(new LoanDtos.PaymentResponse(
                    payment.getId(),
                    payment.getAmount(),
                    payment.getPaymentDate(),
                    accountId,
                    accountId == null ? null : accountNames.get(accountId),
                    payment.getTransactionId()));
        }

        return new LoanDtos.LoanResponse(
                loan.getId(),
                loan.getContactId(),
                contactNames.getOrDefault(loan.getContactId(), ""),
                loan.getLoanType(),
                loan.getStatus(),
                loan.getOriginalAmount(),
                loan.getOriginalAmount().subtract(paid),
                loan.getStartDate(),
                accountId,
                accountId == null ? null : accountNames.get(accountId),
                loan.getDescription(),
                paymentRows);
    }

    /** List mapping — names and paid totals are batch-loaded; no timeline. */
    private LoanDtos.LoanResponse toListResponse(Loan loan, Map<UUID, BigDecimal> paidByLoan,
                                                 Map<UUID, Transaction> originTxns,
                                                 Map<UUID, String> contactNames,
                                                 Map<UUID, String> accountNames) {
        Transaction origin = originTxns.get(loan.getTransactionId());
        UUID accountId = origin == null ? null
                : (origin.getFromAccountId() != null ? origin.getFromAccountId() : origin.getToAccountId());

        return new LoanDtos.LoanResponse(
                loan.getId(),
                loan.getContactId(),
                contactNames.getOrDefault(loan.getContactId(), ""),
                loan.getLoanType(),
                loan.getStatus(),
                loan.getOriginalAmount(),
                loan.getOriginalAmount().subtract(paidByLoan.getOrDefault(loan.getId(), BigDecimal.ZERO)),
                loan.getStartDate(),
                accountId,
                accountId == null ? null : accountNames.get(accountId),
                loan.getDescription(),
                null);
    }

    private Map<UUID, Transaction> transactionsById(Set<UUID> ids) {
        Map<UUID, Transaction> byId = new HashMap<>();
        if (!ids.isEmpty()) {
            for (Transaction txn : transactionRepository.findAllById(ids)) {
                byId.put(txn.getId(), txn);
            }
        }
        return byId;
    }

    private Set<UUID> accountIdsOf(Iterable<Transaction> transactions) {
        Set<UUID> ids = new HashSet<>();
        for (Transaction txn : transactions) {
            if (txn.getFromAccountId() != null) {
                ids.add(txn.getFromAccountId());
            }
            if (txn.getToAccountId() != null) {
                ids.add(txn.getToAccountId());
            }
        }
        return ids;
    }

    private Map<UUID, String> contactNames(Set<UUID> ids) {
        Map<UUID, String> names = new HashMap<>();
        if (!ids.isEmpty()) {
            for (Contact contact : contactRepository.findAllById(ids)) {
                names.put(contact.getId(), contact.getName());
            }
        }
        return names;
    }

    private Map<UUID, String> accountNames(Set<UUID> ids) {
        Map<UUID, String> names = new HashMap<>();
        if (!ids.isEmpty()) {
            for (Account account : accountRepository.findAllById(ids)) {
                names.put(account.getId(), account.getName());
            }
        }
        return names;
    }
}
