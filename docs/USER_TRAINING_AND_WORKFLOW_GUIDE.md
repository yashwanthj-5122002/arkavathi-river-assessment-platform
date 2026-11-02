# Arkavati River Pollution Assessment Project
## User Training, Use Cases and Inter-Organization Workflow

This guide explains how the three principal participant groups use the application and how information moves between them. It is based on the roles, permissions, institution forms, task engine and approval workflow implemented in this application.

## 1. The three participant groups

### A. University / Institution
Purpose: field-data collection, scientific/field evidence entry, assigned-task execution, correction and resubmission.

Institution users work only within their own institution scope. The institution portal provides these structured field modules:

- River Survey - location ID, river/tributary, chainage, GPS, channel geometry, bank and flow condition.
- Drain Survey - drain ID/name, GPS, dimensions, flow condition and outfall connection.
- Hydraulic Structure - bridge, culvert, causeway, check dam, weir/anicut, drain crossing, outfall structure and other structures, including condition and hydraulic status.
- Outfall - industrial, sewage, stormwater, ETP, STP, mixed or unknown discharge point; GPS and flow condition.
- Water Sample - sample ID, sampling date, GPS, laboratory, status and report reference.
- Critical Location - problem category, priority, recommended action and field status.

Institution users can attach evidence, save/edit their own data, submit it for review, respond to corrections, work on tasks assigned to them and monitor notifications/status.

Typical institution use case:

1. Institution user logs in through the Institution portal and selects/uses the assigned institution account.
2. User creates a River Survey, Drain Survey, Structure, Outfall, Water Sample or Critical Location record.
3. GPS coordinates and required field details are entered; supporting files are attached where relevant.
4. Record is saved as a working record/draft until ready.
5. User submits the record.
6. The workflow moves to SUBMITTED and Nakshatech is notified that technical review is required.
7. If Nakshatech requests a correction, the institution receives the correction notification, updates the record and resubmits it.
8. Once approved, the institution can follow status but cannot bypass Nakshatech's technical/final quality gates.

### B. Nakshatech / Organization
Purpose: project coordination, data control, quality assurance, specialist technical review, task management, repository management, final approval and integration.

Nakshatech is the operational quality-control bridge between institution submissions and CNNL-approved outputs.

Main implemented roles include:

- COMPANY_ADMIN - full project administration, users, tasks, repositories, review, final approval, integration and audit.
- COMPANY_PROJECT_MANAGER - project-wide tasks, review, technical/final approval and integration.
- COMPANY_REVIEWER - project-wide technical review.
- COMPANY_DATA_MANAGER - repository/data management and workflow submission.
- COMPANY_DEPARTMENT_USER - department-scoped upload and assigned-task execution.
- COMPANY_CIVIL_REVIEWER - Civil-scoped technical review.
- COMPANY_GIS_REVIEWER - GIS-scoped technical review.
- COMPANY_SURVEY_REVIEWER - Survey-scoped technical review.
- COMPANY_LIDAR_REVIEWER - LiDAR-scoped technical review.
- COMPANY_PHOTOGRAMMETRY_REVIEWER - Photogrammetry-scoped technical review.
- COMPANY_VIEWER - read-oriented company access.

Typical Nakshatech review use case:

1. Submitted institution/department data enters the review queue.
2. Authorized reviewer starts review: SUBMITTED/RESUBMITTED -> UNDER_REVIEW.
3. Reviewer checks data completeness, coordinates, attachments, technical consistency and project relevance.
4. If correction is required, reviewer records a mandatory correction comment and returns it: -> CORRECTION_REQUIRED.
5. Submitter corrects and resubmits: -> RESUBMITTED.
6. Reviewer starts review again and technically approves: -> TECHNICALLY_APPROVED.
7. An authorized Project Manager/Admin performs the final approval: -> FINAL_APPROVED.
8. Authorized management can mark the approved dataset as integrated: -> INTEGRATED.
9. CNNL receives an approved-output notification when the output reaches FINAL_APPROVED or INTEGRATED.

Nakshatech also creates and assigns project tasks. A task can be assigned to an institution, department, organization or user. The assignee works on it, submits output, and Nakshatech reviews/returns/approves/completes it through the task workflow.

### C. CNNL
Purpose: client-side monitoring and access to approved/integrated project outputs.

Implemented CNNL roles are CNNL_ADMIN, CNNL_OFFICIAL and CNNL_VIEWER. CNNL permissions focus on approved-output viewing and report download, rather than editing university field records or performing Nakshatech's technical approval.

Typical CNNL use case:

1. CNNL official logs into the CNNL portal.
2. CNNL views project GIS/global project evidence available to its authorized portal.
3. CNNL opens the Approved Data/approved workflow view.
4. Only FINAL_APPROVED and INTEGRATED workflow outputs are exposed through the CNNL approved-output workflow.
5. CNNL receives notifications when approved outputs become available.
6. CNNL can use/download approved outputs for review, monitoring and project decisions according to its role.

## 2. Connection between University, Nakshatech and CNNL

The core governance chain is:

```text
UNIVERSITY / INSTITUTION
Field survey + scientific evidence + attachments
            |
            v
        SUBMITTED
            |
            v
NAKSHATECH TECHNICAL REVIEW
            |
      +-----+--------------------+
      |                          |
      | correction needed        | technically acceptable
      v                          v
CORRECTION_REQUIRED      TECHNICALLY_APPROVED
      |                          |
      v                          v
Institution corrects      NAKSHATECH FINAL APPROVAL
and RESUBMITS                    |
      |                          v
      +-----------------> FINAL_APPROVED
                                 |
                         +-------+-------+
                         |               |
                         v               v
                     INTEGRATED      CNNL NOTIFIED
                                         |
                                         v
                                 CNNL APPROVED VIEW
```

This means the institution is the data/evidence creator, Nakshatech is the technical and project-level quality gate, and CNNL is the authorized recipient/monitor of approved project outputs.

## 3. What to teach each group

### University training session
Teach: login -> dashboard -> create correct field record -> GPS/fields -> attachments -> save -> submit -> tasks -> notifications -> correction -> resubmit -> status tracking.

Key rule: submission is not the same as approval. A submitted record must pass Nakshatech review.

### Nakshatech training session
Teach: company login -> review queue -> open evidence -> check coordinates/attachments -> return with actionable comment OR technical approve -> final approval by authorized role -> integration -> tasks -> repository -> audit -> industry intelligence.

Key rule: do not approve a record merely because a name or coordinate exists. Review source evidence and the correct workflow status.

### CNNL training session
Teach: CNNL login -> project overview/GIS -> approved data -> notifications -> inspect/download final-approved/integrated outputs.

Key rule: the CNNL approved view is the client-facing approved layer; draft/submitted/correction-stage institution records are not final approved outputs.

## 4. Video + SRT / industry-intelligence use case

This is a separate but connected project-evidence workflow used by authorized users:

1. Copy a matching video and SRT into `production_data/video_srt_pairs/<survey-date>/` OR upload the pair manually in the browser.
2. Open Street View -> Video + SRT.
3. For server files, click Refresh Library, select the pair, and Load Pair.
4. The SRT is parsed for timestamped GPS coordinates.
5. The application aligns the video clock to the GPS route and displays the moving current position on the map.
6. Industry discovery evaluates the route and returns mapped industrial candidates from the configured GIS sources.
7. Identity is retained only when a defensible source supports it. Generic industrial geometry remains unverified rather than receiving an invented company name.
8. Route candidates, coordinates, source identity and nearest video time can then support technical review/reporting.
9. A user can also pause the video and save a georeferenced observed-site record with the exact synchronized video time/GPS position.

Important interpretation: an industry candidate near the survey route is a spatially identified industrial feature. It is not, by itself, evidence that the industry is polluting the river. Pollution/discharge conclusions require the appropriate survey/field/scientific evidence and review.

## 5. Training scenario for a complete demonstration

Use one institution account, one Nakshatech reviewer/manager account and one CNNL account.

1. Institution creates a sample River Survey record and submits it.
2. Nakshatech opens Review Centre, starts review and returns it with a correction comment.
3. Institution opens notification/submission, changes the requested field and resubmits.
4. Nakshatech starts review, technically approves it, then an authorized manager final-approves it.
5. CNNL logs in and confirms that the approved output is now available.
6. Nakshatech optionally integrates the final-approved output and shows audit/notification history.
7. Demonstrate Video + SRT using a known pair, showing synchronized GPS and industry candidates without claiming unverified identities or pollution causation.

That single exercise teaches the full connection between the three organizations.
