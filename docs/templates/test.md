# Backend Implementation for "has not" Operation - Summary

:toc:
:toc-title: Table of Contents
:toclevels: 4

:sectnums:
:sectnumlevels: 0

:pdf-title: My Document
:pdf-header-left: {title}
:pdf-footer-right: Page {page} / {totalPages}

<<<

## Overview
Implemented full backend support for the "has not" selector operation in the report search system. This allows users to search for records that do NOT contain specific option values in selector fields.

## Changes Made

### 1. Rule Definition (`ReportSpecConstraintRule.json`)
**File:** `/workspaces/hrbc/api_source/Core/src/main/resource/porters/hr/api/model/ReportSpecConstraintRule.json`

Added new rule definition:
```json
"has not": {
    "pattern": "([\\d]+)",
    "order": [1],
    "where": "`%1$s`.`%2$s`<>?",
    "category": "selector",
    "filters": [null]
}
```

- **Pattern**: Captures a single digit string (option ID)
- **Where clause**: Generates `!=` (not equal) comparison for individual values
- **Category**: Selector field type
- **Filters**: None (raw value passed through)

### 2. Query Builder Logic (`ReportResource.java`)
**File:** `/workspaces/hrbc/api_source/Core/src/main/java/porters/hr/api/resource/ReportResource.java`

Added conditional handler after line 2401:
```java
else if (category == ReportSpecConstraintRuleCategory.SELECTOR
    && constraints.size() > 0
    && ReportSpecConstraintRule.factory("has not").equals(constraints.get(0).getRule()))
{
    // Anti-join pattern for "has not" selector: find records NOT matching the specified options.
    // Using NOT IN with LEFT JOIN and IS NULL pattern to exclude records with matching options.
    sql.leftJoin(tableName, tableAlias, on);

    List<Object> notInValues = new ArrayList<Object>();
    for (ReportSpecConstraint constraint : constraints)
    {
        notInValues.addAll(constraint.getRule().buildSQLParameters(constraint.getValue()));
    }

    SQLBuilder orPeers = new SQLBuilder().initWhere();
    orPeers.whereColumnIn(tableAlias, columnName, notInValues.size(), SQLBuilder.Operation.NONE, true);

    String extraWhere = new SQLBuilder().initWhere()
            .whereColumn(tableAlias, linkColumn, "<=> NULL", SQLBuilder.Operation.NONE)
            .where(orPeers.toString(), SQLBuilder.Operation.OR)
            .toString();

    bindValues.addAll(notInValues);
    postNotLikeWhere.add(new String[] {extraWhere, null});
}
```

## Implementation Details

### Query Strategy: Anti-join Pattern with NOT IN

The "has not" operation uses an anti-join pattern similar to `notLike` operations:

1. **LEFT JOIN** to the search table - includes records that don't match
2. **NOT IN clause** - filters out records with matching option IDs
3. **IS NULL check** - identifies records with no matching join row

### SQL Generated (Example)
For field "Status" with "has not" values [5, 10]:
```sql
LEFT JOIN search_table t1 
  ON main.id = t1.id
AND t1.column_id = <status_field_id>
WHERE t1.id IS NULL OR t1.option_id NOT IN (5, 10)
```

This query returns:
- Records with no Status value (t1.id IS NULL)
- Records with Status values NOT in (5, 10)

### Data Flow

**Frontend Entry Format (from p.searchconstraint.js):**
```
{field: "Status", value: "has not 5"}
{field: "Status", value: "has not 10"}
```

**Constraint Format (after grouping):**
```json
{
  "rule": "has not",
  "field": "Status",
  "value": "has not 5",
  "groupId": "status_hasnot"
}
```

**Backend Processing:**
1. Parse constraints with "has not" rule
2. Extract option IDs from each constraint value
3. Build NOT IN condition using `whereColumnIn(..., true)` 
4. Combine with IS NULL for anti-join pattern
5. Add to `postNotLikeWhere` for later processing

## Validation

- **Syntax validation**: No compilation errors reported by Language Server
- **Logic validation**: 
  - Follows existing "has 0" and "notLike" patterns
  - Correctly uses SQLBuilder API with NOT IN support
  - Properly groups multiple "has not" constraints
  - Maintains consistency with other selector operations

## Related Changes

- **Frontend** (already implemented):
  - Rule definition in p.searchconstraint.js (operation: 'has not')
  - Entry generation logic in getEntries()
  - Constraint grouping logic in setEntries()
  - UI updates to show options picker

## Testing Recommendations

1. **Unit tests** for "has not" constraint parsing
2. **Integration tests** for query generation with NOT IN pattern
3. **End-to-end tests** searching for records with specific excluded options
4. **Edge cases**:
   - Empty result sets
   - All options excluded
   - Mixed "has" and "has not" on different fields
   - Null/unset option values

## Compatibility

- Backward compatible: Existing "has" and "has 0" operations unchanged
- Follows established patterns: Uses same anti-join strategy as "notLike"
- No breaking changes to API or data model
 