# FHIR-Aligned Organization & Billing Hierarchy

This project implements a hierarchical organizational and billing structure based on the **HL7 FHIR Organization** resource specification.

## Architectural Overview

In FHIR, an `Organization` can represent any grouping from a global corporation to a local clinic. We map this using a multi-level structure that separates operational units from legal/billing entities.

### 1. Organizational Hierarchy
- **Company (Root):** The parent corporate entity.
- **PracticeGroup (Intermediate):** Logical groupings (e.g., "Northeast Oncology").
    - Supports **Recursive Nesting**: Groups can have a `parentId` to form infinite sub-regions.
- **Practice (Leaf):** The actual clinical site providing healthcare services.

### 2. Billing & Identification Hierarchy
To support Revenue Cycle Management (RCM), we separate financial identity from operational units:

- **TaxId (Legal Entity):** 
    - Represents the entity that files taxes (EIN).
    - Linked directly to a **Company**.
    - One Company can have multiple Tax IDs if they operate different legal businesses.
- **GroupNpi (Operational Identifier):**
    - The 10-digit National Provider Identifier (NPI) used for billing.
    - Linked to a **TaxId** (Who gets paid).
    - **Flexible Operational Links:** A `GroupNpi` can be linked to either a `PracticeGroup` (shared NPI across a region) or a `Practice` (unique NPI for a single site).

## Schema Relationships

| Model | Parent | Key Relationship |
| :--- | :--- | :--- |
| **TaxId** | Company | Multiple Tax IDs per Company |
| **GroupNpi** | TaxId | Multiple NPIs per Tax ID |
| **GroupNpi** | PracticeGroup | (Optional) Links NPI to a regional group |
| **GroupNpi** | Practice | (Optional) Links NPI to a specific location |
| **Practice** | TaxId | (Optional) Links a Practice to its legal billing entity |

## Data Integrity & Safety

- **Cascading Deletes:** 
    - Deleting a `Company` removes its `PracticeGroups` and `TaxIds`.
    - Deleting a `TaxId` removes its associated `GroupNpis`.
- **Set Null Safety:** 
    - Deleting a `PracticeGroup` or `Practice` does **not** delete the NPI; it simply unlinks it, preserving billing history.

## Compliance
This structure ensures the TriState Backend is fully compliant with FHIR's `Organization.identifier` patterns, allowing for seamless integration with US healthcare billing standards (NPI/EIN).
