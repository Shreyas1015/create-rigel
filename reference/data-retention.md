# Data retention and personal data

Retention is a decision whether or not anyone makes it. Absent a stated policy, the answer is
"forever", which is both a growing cost and a growing liability.

## Classify before you decide

Not all stored data carries the same obligations. Separate: operational data the system needs;
personal data identifying a person; sensitive personal data — health, financial, biometric,
government identifiers; and secrets, which are not data to be retained but credentials to be
managed. The class sets the requirements.

## What has to be decided

- **How long** each class is kept, and what happens at the boundary: hard delete, anonymise, or
  archive to colder storage.
- **Deletion on request** — whether a user can compel erasure, and what that means for records
  referencing theirs.
- **Encryption** at rest and in transit, and where the keys live.
- **What appears in logs.** Logs are the most common place personal data is retained by accident,
  because nobody decided it was retention.

## Deletion is harder than it looks

A hard delete of a referenced row breaks foreign keys, audit trails, and aggregates. Soft deletes
keep referential integrity but do not satisfy an erasure obligation — the data is still there.
The usual resolution is anonymisation: keep the row and its relationships, destroy the identifying
fields. Decide which, per entity, before either is written.

## How it is usually got wrong

- Retention discussed for the database and never for logs, backups, or analytics exports.
- Soft delete treated as erasure.
- Personal data copied into a cache or a search index with no retention of its own.
- Backups outliving the retention policy the primary store enforces.

## Standard

OWASP ASVS: Data Protection. AWS Well-Architected, Security Pillar.
