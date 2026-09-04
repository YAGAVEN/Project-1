package org.finance.tracker.account;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.finance.tracker.auth.CurrentUser;
import org.finance.tracker.common.PeriodType;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** /api/v1/accounts (backend.md §8.3). */
@RestController
@RequestMapping("/api/v1/accounts")
@RequiredArgsConstructor
public class AccountController {

    private final AccountService accountService;
    private final CurrentUser currentUser;

    @GetMapping
    List<AccountDtos.AccountResponse> list() {
        return accountService.list(currentUser.requireUserId());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    AccountDtos.AccountResponse create(@Valid @RequestBody AccountDtos.CreateAccountRequest request) {
        return accountService.create(currentUser.requireUserId(), request);
    }

    @GetMapping("/{id}")
    AccountDtos.AccountDetailResponse detail(
            @PathVariable UUID id,
            @RequestParam(required = false) PeriodType periodType,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return accountService.getDetail(currentUser.requireUserId(), id, periodType, date);
    }

    @PutMapping("/{id}")
    AccountDtos.AccountResponse update(@PathVariable UUID id,
                                       @Valid @RequestBody AccountDtos.UpdateAccountRequest request) {
        return accountService.update(currentUser.requireUserId(), id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID id) {
        accountService.delete(currentUser.requireUserId(), id);
    }
}
