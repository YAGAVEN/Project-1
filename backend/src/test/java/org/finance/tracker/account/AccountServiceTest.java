package org.finance.tracker.account;

import org.finance.tracker.transaction.TransactionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Audit Phase 2: the balance true-up must serialize concurrent re-anchors on
 * the account row, and net worth must include deactivated accounts.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AccountServiceTest {

    private static final UUID USER = UUID.randomUUID();

    @Mock
    private AccountRepository accountRepository;
    @Mock
    private TransactionRepository transactionRepository;
    @Mock
    private org.finance.tracker.category.CategoryRepository categoryRepository;

    private AccountService service;

    @BeforeEach
    void setUp() {
        service = new AccountService(accountRepository, transactionRepository, categoryRepository);
        when(accountRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
    }

    private Account account(AccountType type, boolean active, BigDecimal opening) {
        Account account = new Account();
        account.setId(UUID.randomUUID());
        account.setUserId(USER);
        account.setName(type == AccountType.CREDIT_CARD ? "Card" : "Bank");
        account.setAccountType(type);
        account.setActive(active);
        account.setOpeningBalance(opening);
        return account;
    }

    @Test
    void balanceTrueUpReAnchorsOpeningBalanceFromLockedRowAndCurrentNetFlow() {
        Account account = account(AccountType.BANK, true, new BigDecimal("50000.00"));
        when(accountRepository.findByIdAndUserId(account.getId(), USER)).thenReturn(Optional.of(account));
        when(accountRepository.findByIdAndUserIdForUpdate(account.getId(), USER))
                .thenReturn(Optional.of(account));
        // opening 50,000 + net flow 2,000 → balance 52,000; user types 45,000
        when(transactionRepository.netFlow(account.getId())).thenReturn(new BigDecimal("2000.00"));

        service.update(USER, account.getId(),
                new AccountDtos.UpdateAccountRequest(null, new BigDecimal("45000.00"), null, null, null, null));

        ArgumentCaptor<Account> captor = ArgumentCaptor.forClass(Account.class);
        verify(accountRepository).save(captor.capture());
        // opening' = 45,000 − 2,000 = 43,000 exactly, on paise
        assertThat(captor.getValue().getOpeningBalance()).isEqualByComparingTo("43000.00");
        verify(accountRepository).findByIdAndUserIdForUpdate(account.getId(), USER);
    }

    @Test
    void trueUpKeepsPaiseExactnessOnFractionalNetFlow() {
        Account account = account(AccountType.BANK, true, new BigDecimal("100.00"));
        when(accountRepository.findByIdAndUserId(account.getId(), USER)).thenReturn(Optional.of(account));
        when(accountRepository.findByIdAndUserIdForUpdate(account.getId(), USER))
                .thenReturn(Optional.of(account));
        when(transactionRepository.netFlow(account.getId())).thenReturn(new BigDecimal("10.555"));

        service.update(USER, account.getId(),
                new AccountDtos.UpdateAccountRequest(null, new BigDecimal("500.00"), null, null, null, null));

        ArgumentCaptor<Account> captor = ArgumentCaptor.forClass(Account.class);
        verify(accountRepository).save(captor.capture());
        assertThat(captor.getValue().getOpeningBalance()).isEqualByComparingTo("489.45");
    }

    @Test
    void netWorthBalancesIncludeDeactivatedAccounts() {
        Account active = account(AccountType.BANK, true, new BigDecimal("1000.00"));
        Account closed = account(AccountType.BANK, false, new BigDecimal("700.00"));
        closed.setName("Old Bank");
        when(accountRepository.findAllByUserId(USER)).thenReturn(List.of(active, closed));
        when(transactionRepository.inflowByAccounts(any())).thenReturn(List.of());
        when(transactionRepository.outflowByAccounts(any())).thenReturn(List.of());

        var balances = service.balanceByAccountIncludingInactive(USER);

        assertThat(balances).containsKeys(active.getId(), closed.getId());
        assertThat(balances.get(closed.getId())).isEqualByComparingTo("700.00");
    }

    @Test
    void creditCardOutstandingIsThePositiveFormOfANegativeBalance() {
        Account card = account(AccountType.CREDIT_CARD, true, new BigDecimal("0.00"));
        card.setCreditLimit(new BigDecimal("100000.00"));
        when(accountRepository.findByIdAndUserId(card.getId(), USER)).thenReturn(Optional.of(card));
        when(accountRepository.findByIdAndUserIdForUpdate(card.getId(), USER)).thenReturn(Optional.of(card));
        // opening 0 + net −12,345 → balance −12,345 → outstanding 12,345
        when(transactionRepository.netFlow(card.getId())).thenReturn(new BigDecimal("-12345.00"));

        var response = service.update(USER, card.getId(),
                new AccountDtos.UpdateAccountRequest(null, null, null, null, null, null));

        assertThat(response.balance()).isEqualByComparingTo("-12345.00");
    }
}
