package org.finance.tracker.contact;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.finance.tracker.auth.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/** /api/v1/contacts (backend.md §8.7). */
@RestController
@RequestMapping("/api/v1/contacts")
@RequiredArgsConstructor
public class ContactController {

    private final ContactService contactService;
    private final CurrentUser currentUser;

    @GetMapping
    List<ContactDtos.ContactResponse> list() {
        return contactService.list(currentUser.requireUserId()).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    ContactDtos.ContactResponse create(@Valid @RequestBody ContactDtos.CreateContactRequest request) {
        return toResponse(contactService.create(currentUser.requireUserId(), request));
    }

    /** 200 — the derived per-contact loan summary (§8.7). */
    @GetMapping("/{id}")
    ContactDtos.ContactSummaryResponse summary(@PathVariable UUID id) {
        return contactService.summary(currentUser.requireUserId(), id);
    }

    @PutMapping("/{id}")
    ContactDtos.ContactResponse update(@PathVariable UUID id,
                                       @Valid @RequestBody ContactDtos.UpdateContactRequest request) {
        return toResponse(contactService.update(currentUser.requireUserId(), id, request));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID id) {
        contactService.delete(currentUser.requireUserId(), id);
    }

    private ContactDtos.ContactResponse toResponse(Contact contact) {
        return new ContactDtos.ContactResponse(contact.getId(), contact.getName(), contact.getNotes());
    }
}
