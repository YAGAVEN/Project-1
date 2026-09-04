package org.finance.tracker.contact;

import lombok.RequiredArgsConstructor;
import org.finance.tracker.common.ConflictException;
import org.finance.tracker.common.NotFoundException;
import org.finance.tracker.loan.Loan;
import org.finance.tracker.loan.LoanPaymentRepository;
import org.finance.tracker.loan.LoanRepository;
import org.finance.tracker.loan.LoanType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Contact CRUD + the per-contact loan summary (backend.md §8.7).
 * Summary math is always derived from loans + payments (§6.6) — nothing stored.
 */
@Service
@RequiredArgsConstructor
public class ContactService {

    private final ContactRepository contactRepository;
    private final LoanRepository loanRepository;
    private final LoanPaymentRepository loanPaymentRepository;

    @Transactional(readOnly = true)
    public List<Contact> list(UUID userId) {
        return contactRepository.findByUserIdOrderByNameAsc(userId);
    }

    @Transactional
    public Contact create(UUID userId, ContactDtos.CreateContactRequest request) {
        Contact contact = new Contact();
        contact.setUserId(userId);
        contact.setName(request.name());
        contact.setNotes(request.notes());
        return contactRepository.save(contact);
    }

    /** §8.7 — summary: totalLent/totalReturned/totalBorrowed/totalRepaid/netPending. */
    @Transactional(readOnly = true)
    public ContactDtos.ContactSummaryResponse summary(UUID userId, UUID contactId) {
        Contact contact = getOwnedContact(userId, contactId);
        List<Loan> loans = loanRepository.findByUserIdAndContactId(userId, contactId);

        BigDecimal lent = BigDecimal.ZERO;
        BigDecimal borrowed = BigDecimal.ZERO;
        List<UUID> lentLoanIds = new java.util.ArrayList<>();
        List<UUID> borrowedLoanIds = new java.util.ArrayList<>();
        for (Loan loan : loans) {
            if (loan.getLoanType() == LoanType.LENT) {
                lent = lent.add(loan.getOriginalAmount());
                lentLoanIds.add(loan.getId());
            } else {
                borrowed = borrowed.add(loan.getOriginalAmount());
                borrowedLoanIds.add(loan.getId());
            }
        }

        // returned = payments on loans I gave; repaid = payments on loans I took
        BigDecimal totalReturned = lentLoanIds.isEmpty()
                ? BigDecimal.ZERO
                : loanPaymentRepository.sumByLoanIdIn(lentLoanIds);
        BigDecimal totalRepaid = borrowedLoanIds.isEmpty()
                ? BigDecimal.ZERO
                : loanPaymentRepository.sumByLoanIdIn(borrowedLoanIds);

        BigDecimal receivable = lent.subtract(totalReturned);
        BigDecimal payable = borrowed.subtract(totalRepaid);

        return new ContactDtos.ContactSummaryResponse(
                contact.getId(),
                contact.getName(),
                lent,
                totalReturned,
                borrowed,
                totalRepaid,
                receivable.subtract(payable));
    }

    @Transactional
    public Contact update(UUID userId, UUID contactId, ContactDtos.UpdateContactRequest request) {
        Contact contact = getOwnedContact(userId, contactId);
        if (request.name() != null) {
            contact.setName(request.name());
        }
        if (request.notes() != null) {
            contact.setNotes(request.notes());
        }
        return contactRepository.save(contact);
    }

    /** schema.md §18 — hard delete only while no loan references the contact. */
    @Transactional
    public void delete(UUID userId, UUID contactId) {
        Contact contact = getOwnedContact(userId, contactId);
        if (loanRepository.existsByUserIdAndContactId(userId, contactId)) {
            throw new ConflictException("Cannot delete a contact that has loans — delete their loans first");
        }
        contactRepository.delete(contact);
    }

    public Contact getOwnedContact(UUID userId, UUID contactId) {
        return contactRepository.findByIdAndUserId(contactId, userId)
                .orElseThrow(() -> NotFoundException.resource("Contact"));
    }
}
