# Role and Use-Case Matrix
## Arkavati River Pollution Assessment Project

| Actor / Role | Main Purpose | Can Create / Edit | Can Review | Can Final Approve | Can Integrate | Approved View |
|---|---|---|---|---|---|---|
| Institution Admin | Institution coordination and own-scope submission | Own institution data | No | No | No | Own status/results |
| Institution User | Field/scientific data entry and assigned tasks | Own institution data | No | No | No | Own status/results |
| Institution Viewer | Read own institution scope | No | No | No | No | Own scope |
| Nakshatech Department User | Department upload/task execution | Department repository/task output | No final QA | No | No | Authorized department scope |
| Nakshatech Specialist Reviewer | Department-specific technical QA | Review comments | Yes, technical | No | No | Relevant project data |
| Nakshatech Reviewer | Project-wide technical QA | Review comments | Yes, technical | No | No | Project data |
| Nakshatech Project Manager | Project coordination/approval | Tasks/management actions | Yes | Yes | Yes | Project-wide |
| Nakshatech Company Admin | Full administration | Users/tasks/data administration | Yes | Yes | Yes | Project-wide/audit |
| CNNL Official/Admin | Client monitoring | No institution edits | No Nakshatech technical review | No | No | FINAL_APPROVED / INTEGRATED outputs |
| CNNL Viewer | Read-only client view | No | No | No | No | Approved/integrated outputs |

## Use Case UC-01 - Institution Field Submission
**Trigger:** A university team completes a river/drain/structure/outfall/water-sample/critical-location survey observation.

**Main flow:**
1. User authenticates under the correct institution.
2. User chooses the correct field module.
3. Required fields/GPS are entered.
4. Evidence attachments are added when applicable.
5. User checks the record and submits.
6. System creates/synchronizes workflow state as SUBMITTED.
7. Nakshatech receives REVIEW_REQUIRED notification.

**Result:** The record is formally in the controlled review chain; it is not yet approved.

## Use Case UC-02 - Technical Review and Correction Loop
**Trigger:** Nakshatech reviewer opens a submitted/resubmitted record.

**Main flow:**
1. Reviewer starts review -> UNDER_REVIEW.
2. Reviewer evaluates completeness, technical consistency, coordinates and evidence.
3. If inadequate, reviewer enters a correction comment -> CORRECTION_REQUIRED.
4. Original submitter is notified.
5. Institution corrects the source record and resubmits -> RESUBMITTED.
6. Reviewer repeats review.

**Result:** Defects are corrected at source rather than silently edited by the approver.

## Use Case UC-03 - Technical Approval, Final Approval and Integration
**Trigger:** A record under review meets the technical requirements.

**Main flow:**
1. Authorized reviewer performs technical approval -> TECHNICALLY_APPROVED.
2. Nakshatech receives FINAL_APPROVAL_REQUIRED notification.
3. Project Manager/Admin performs final approval -> FINAL_APPROVED.
4. CNNL receives APPROVED_OUTPUT notification.
5. Authorized Nakshatech role may mark the dataset INTEGRATED after incorporation into the approved project output.

**Result:** CNNL receives only quality-gated approved/integrated outputs through the approved workflow view.

## Use Case UC-04 - Task Assignment to Institution / Department
**Trigger:** Nakshatech identifies a survey/data action required from a team.

**Main flow:**
1. Nakshatech creates task with title, description, priority, due date and scope.
2. Task is assigned to user/institution/department/organization.
3. Assignee starts task and performs work.
4. Assignee submits task output.
5. Nakshatech reviews.
6. Output may be returned for correction or approved/completed.

**Result:** Project instructions and deliverables are traceable instead of being handled only through informal messages.

## Use Case UC-05 - Department Repository Upload
**Trigger:** Nakshatech department has an approved project data package to store.

**Main flow:**
1. Authorized user opens Department Data Hub.
2. Department access is unlocked using the department authorization/passkey mechanism.
3. A data batch is created with date/category/description.
4. Files upload using resumable chunks.
5. Batch is finalized and becomes part of the controlled repository.
6. Authorized company roles can view/download project-wide repository data; department users remain scoped.

**Result:** Project files are stored with department/date/batch metadata and access control.

## Use Case UC-06 - Video + SRT Route and Industry Intelligence
**Trigger:** Survey operator has a matching drone/field video and SRT telemetry file.

**Main flow:**
1. Operator copies pair to `production_data/video_srt_pairs/<DATE>/` or uploads manually.
2. User opens Video + SRT workspace.
3. Server library is refreshed and the pair is loaded.
4. SRT GPS is parsed; video time is aligned to route samples.
5. Route/current position is displayed on the map.
6. Industry discovery evaluates mapped candidates near the route.
7. Candidate identity is sourced from available configured GIS/registry evidence.
8. If a defensible identity is unavailable, the site stays generic/unverified.
9. User can save an observed site with synchronized frame time and GPS.

**Result:** Video evidence, route coordinates and mapped industrial context are tied together without inventing identities.

## Use Case UC-07 - CNNL Approved Output Monitoring
**Trigger:** A workflow reaches FINAL_APPROVED or INTEGRATED.

**Main flow:**
1. CNNL receives approved-output notification.
2. CNNL logs in through the CNNL portal.
3. CNNL opens approved data/workflow output.
4. CNNL inspects/downloads the approved information available to the role.

**Result:** Client monitoring is separated from draft/review-stage work.

## Governance connection in one sentence
**Universities create and correct evidence; Nakshatech assigns work, validates, technically reviews, finally approves and integrates it; CNNL consumes and monitors the approved/integrated output.**
