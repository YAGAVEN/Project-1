package org.finance.tracker.transaction;

import org.finance.tracker.account.Account;
import org.finance.tracker.account.AccountRepository;
import org.finance.tracker.account.AccountService;
import org.finance.tracker.account.AccountType;
import org.finance.tracker.category.Category;
import org.finance.tracker.category.CategoryRepository;
import org.finance.tracker.category.CategoryService;
import org.finance.tracker.category.CategoryType;
import org.finance.tracker.common.BadRequestException;
import org.finance.tracker.common.ConflictException;
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
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The §9.1 per-type validation matrix at unit level — every rule the whole UI
 * depends on, no database needed.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class TransactionServiceValidationTest {

    private static final UUID USER = UUID.randomUUID();
    private static final LocalDate TODAY = LocalDate.of(2026, 9, 4);

    @Mock
    private TransactionRepository transactionRepository;
    @Mock
    private AccountService accountService;
    @Mock
    private AccountRepository accountRepository;
    @Mock
    private CategoryService categoryService;
    @Mock
    private CategoryRepository categoryRepository;

    @InjectMocks
    private TransactionService service;

    private Account bank;
    private Account card;
    private Category incomeCategory;
    private Category expenseCategory;

    @BeforeEach
    void setUp() {
        bank = account(AccountType.BANK, true);
        card = account(AccountType.CREDIT_CARD, true);
        incomeCategory = category(CategoryType.INCOME, true);
        expenseCategory = category(CategoryType.EXPENSE, true);

        when(transactionRepository.save(any())).thenAnswer(invocation -> {
            Transaction saved = invocation.getArgument(0);
            saved.setId(UUID.randomUUID());
            return saved;
        });
    }

    @Test
    void incomeIntoCreditCardConflicts() {
        when(accountService.getOwnedAccount(USER, card.getId())).thenReturn(card);

        assertThatThrownBy(() -> service.create(USER, income(null, card.getId(), incomeCategory.getId())))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    void transferToSameAccountConflicts() {
        when(accountService.getOwnedAccount(USER, bank.getId())).thenReturn(bank);

        assertThatThrownBy(() -> service.create(USER, transfer(bank.getId(), bank.getId())))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    void loanTypesAreRejectedOnTheGenericApi() {
        for (TransactionType loanType : new TransactionType[]{
                TransactionType.LOAN_GIVEN, TransactionType.LOAN_RECEIVED,
                TransactionType.LOAN_REPAYMENT_IN, TransactionType.LOAN_REPAYMENT_OUT}) {
            assertThatThrownBy(() -> service.create(USER,
                    new TransactionDtos.CreateTransactionRequest(loanType, BigDecimal.ONE,
                            null, null, null, null, TODAY, null)))
                    .isInstanceOf(BadRequestException.class);
        }
    }

    @Test
    void expenseRequiresAnExpenseCategory() {
        when(accountService.getOwnedAccount(USER, bank.getId())).thenReturn(bank);
        when(categoryService.getOwnedCategory(USER, incomeCategory.getId())).thenReturn(incomeCategory);

        assertThatThrownBy(() -> service.create(USER, expense(bank.getId(), incomeCategory.getId())))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void inactiveAccountsAreRejected() {
        Account closed = account(AccountType.BANK, false);
        when(accountService.getOwnedAccount(USER, closed.getId())).thenReturn(closed);

        assertThatThrownBy(() -> service.create(USER, expense(closed.getId(), expenseCategory.getId())))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void incomeMustNotHaveAFromAccount() {
        assertThatThrownBy(() -> service.create(USER, income(bank.getId(), bank.getId(), incomeCategory.getId())))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void transferRequiresBothSides() {
        when(accountService.getOwnedAccount(USER, bank.getId())).thenReturn(bank);

        assertThatThrownBy(() -> service.create(USER, transfer(bank.getId(), null)))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void happyExpenseSavesTheRightShapeAndRecomputesBalances() {
        when(accountService.getOwnedAccount(USER, bank.getId())).thenReturn(bank);
        when(categoryService.getOwnedCategory(USER, expenseCategory.getId())).thenReturn(expenseCategory);
        when(accountService.currentBalance(bank)).thenReturn(new BigDecimal("74550.00"));

        var response = service.create(USER, expense(bank.getId(), expenseCategory.getId()));

        assertThat(response.transactionType()).isEqualTo(TransactionType.EXPENSE);
        assertThat(response.fromAccountName()).isEqualTo(bank.getName());
        assertThat(response.fromAccountBalance()).isEqualByComparingTo("74550.00");
        assertThat(response.categoryName()).isEqualTo(expenseCategory.getName());

        ArgumentCaptor<Transaction> captor = ArgumentCaptor.forClass(Transaction.class);
        verify(transactionRepository).save(captor.capture());
        Transaction saved = captor.getValue();
        assertThat(saved.getTransactionType()).isEqualTo(TransactionType.EXPENSE);
        assertThat(saved.getFromAccountId()).isEqualTo(bank.getId());
        assertThat(saved.getToAccountId()).isNull();
        assertThat(saved.getUserId()).isEqualTo(USER);
        assertThat(saved.getAmount()).isEqualByComparingTo("500.00");
    }

    private TransactionDtos.CreateTransactionRequest income(UUID from, UUID to, UUID categoryId) {
        return new TransactionDtos.CreateTransactionRequest(TransactionType.INCOME,
                new BigDecimal("1000.00"), from, to, categoryId, "Salary", TODAY, null);
    }

    private TransactionDtos.CreateTransactionRequest expense(UUID from, UUID categoryId) {
        return new TransactionDtos.CreateTransactionRequest(TransactionType.EXPENSE,
                new BigDecimal("500.00"), from, null, categoryId, "Lunch", TODAY, null);
    }

    private TransactionDtos.CreateTransactionRequest transfer(UUID from, UUID to) {
        return new TransactionDtos.CreateTransactionRequest(TransactionType.TRANSFER,
                new BigDecimal("1000.00"), from, to, null, "Moving money", TODAY, null);
    }

    private Account account(AccountType type, boolean active) {
        Account account = new Account();
        account.setId(UUID.randomUUID());
        account.setUserId(USER);
        account.setName(type == AccountType.CREDIT_CARD ? "Card" : "Bank");
        account.setAccountType(type);
        account.setActive(active);
        return account;
    }

    private Category category(CategoryType type, boolean active) {
        Category category = new Category();
        category.setId(UUID.randomUUID());
        category.setUserId(USER);
        category.setName(type == CategoryType.INCOME ? "Salary" : "Food");
        category.setCategoryType(type);
        category.setActive(active);
        return category;
    }
}
