# Washington Zero-PDF Priorities

Date: 2026-03-19

Purpose: rank the remaining Washington targets with `0` PDFs by likely human impact, not by crawl footprint.

Method:
- Start from the current WA `0`-PDF systems in the database.
- Rank by practical patient impact using Washington hospital-system prominence and catchment area, not HTML volume.
- Order in three buckets:
  1. major statewide systems first
  2. regional/community hospitals next
  3. specialty / behavioral / federal systems last
- Flag duplicate or directory-like seeds separately so they do not steal time from real hospital targets.

Reference inputs:
- WSHA member hospitals roster
- Washington HCA materials noting the largest hospital systems in the state
- current WA crawler output in Postgres

## 1. Major Statewide Systems First

1. `UW Medicine`
   - Why high impact: one of the largest and most influential health systems in Washington; major academic / tertiary / trauma presence.
   - Current DB state: `0` PDFs, `3` HTML docs, all `3` error docs.
   - Notes: high-priority blocker; likely access/gating issue, not lack of real records workflow.

2. `EvergreenHealth`
   - Why high impact: major Eastside system with broad regional reach.
   - Current DB state: `0` PDFs, `29` HTML docs, `2` error docs.
   - Notes: large patient impact; likely worth manual assist or targeted records-page sourcing.

## 2. Regional / Community Hospitals Next

3. `Confluence Health`
   - Why high impact: major provider across North Central Washington with multi-campus regional reach.
   - Current DB state: `0` PDFs, `105` HTML docs, `0` error docs.
   - Notes: accessible but poorly captured; likely a crawler-path problem rather than site blocking.

4. `Trios Health`
   - Why high impact: meaningful Tri-Cities regional provider.
   - Current DB state: `0` PDFs, `18` HTML docs, `0` error docs.

5. `Lourdes Health`
   - Why high impact: another significant Tri-Cities regional provider.
   - Current DB state: `0` PDFs, `16` HTML docs, `0` error docs.

6. `Kittitas Valley Healthcare`
   - Why high impact: important community provider for Central Washington.
   - Current DB state: `0` PDFs, `18` HTML docs, `0` error docs.

7. `Skagit Regional Health`
   - Why high impact: large regional hospital system in Northwest Washington.
   - Current DB state: `0` PDFs, `4` HTML docs, `4` error docs.
   - Notes: meaningful target, but currently blocked.

8. `WhidbeyHealth`
   - Why high impact: major local provider for Whidbey Island.
   - Current DB state: `0` PDFs, `4` HTML docs, `0` error docs.

9. `Olympic Medical Center`
   - Why high impact: major community hospital on the Olympic Peninsula.
   - Current DB state: `0` PDFs, `1` HTML doc, `1` error doc.

10. `Mason Health`
   - Why high impact: important local community hospital.
   - Current DB state: `0` PDFs, `1` HTML doc, `0` error docs.

11. `Samaritan Healthcare`
   - Why high impact: meaningful inland regional/community hospital.
   - Current DB state: `0` PDFs, `1` HTML doc, `0` error docs.

12. `Pullman Regional Hospital`
   - Why high impact: key hospital in the Pullman area.
   - Current DB state: `0` PDFs, `2` HTML docs, `0` error docs.

13. `North Valley Hospital`
   - Why high impact: local community hospital with real regional patient impact.
   - Current DB state: `0` PDFs, `5` HTML docs, `0` error docs.

14. `Coulee Medical Center`
   - Why high impact: rural community hospital with substantial local dependence.
   - Current DB state: `0` PDFs, `12` HTML docs, `0` error docs.

15. `Forks Community Hospital`
   - Why high impact: isolated rural community provider.
   - Current DB state: `0` PDFs, `10` HTML docs, `0` error docs.

16. `Tri-State Health`
   - Why high impact: smaller but meaningful regional hospital.
   - Current DB state: `0` PDFs, `1` HTML doc, `1` error doc.

17. `Lincoln Hospital`
   - Why high impact: smaller rural hospital with local importance.
   - Current DB state: `0` PDFs, `1` HTML doc, `1` error doc.

18. `Othello Community Hospital`
   - Why high impact: smaller community hospital with local importance.
   - Current DB state: `0` PDFs, `4` HTML docs, `0` error docs.

19. `Odessa Memorial Healthcare Center`
   - Why high impact: smaller rural provider with concentrated local importance.
   - Current DB state: `0` PDFs, `4` HTML docs, `0` error docs.

20. `Ocean Beach Health`
   - Why high impact: smaller coastal community provider.
   - Current DB state: `0` PDFs, `2` HTML docs, `0` error docs.

21. `Prosser Memorial Health`
   - Why high impact: smaller regional/community provider.
   - Current DB state: `0` PDFs, `1` HTML doc, `1` error doc.

22. `Whitman Hospital & Medical Clinics`
   - Why high impact: smaller community hospital and clinic system.
   - Current DB state: `0` PDFs, `1` HTML doc, `1` error doc.

23. `Arbor Health`
   - Why high impact: smaller rural/community provider.
   - Current DB state: `0` PDFs, `1` HTML doc, `1` error doc.

24. `Ferry County Health`
   - Why high impact: small rural provider with outsized local importance.
   - Current DB state: `0` PDFs, `3` HTML docs, `0` error docs.

25. `Snoqualmie Valley Health`
   - Why high impact: smaller community provider.
   - Current DB state: `0` PDFs, `2` HTML docs, `0` error docs.

## 3. Specialty / Behavioral / Federal Systems

26. `Shriners Children's Spokane`
   - Why this leads the specialty bucket: high pediatric specialty impact despite narrow scope.
   - Current DB state: `0` PDFs, `30` HTML docs, `0` error docs.

27. `Mary Bridge Children's Hospital`
   - Why high impact: major pediatric hospital, though organizationally related to MultiCare.
   - Current DB state: `0` PDFs, `2` HTML docs, `2` error docs.

28. `Providence Swedish Rehabilitation Hospital`
   - Why here: specialty rehab; meaningful but narrower than a statewide acute-care system.
   - Current DB state: `0` PDFs, `4` HTML docs, `0` error docs.

29. `Kindred Hospital Seattle - First Hill`
   - Why here: specialty long-term acute care facility.
   - Current DB state: `0` PDFs, `1` HTML doc, `1` error doc.

30. `Navos`
   - Why here: behavioral-health-specific system.
   - Current DB state: `0` PDFs, `2` HTML docs, `2` error docs.

31. `Wellfound Behavioral Health Hospital`
   - Why here: behavioral hospital, meaningful but narrower population served.
   - Current DB state: `0` PDFs, `2` HTML docs, `2` error docs.

32. `South Sound Behavioral Hospital`
   - Why here: behavioral-health-focused hospital.
   - Current DB state: `0` PDFs, `2` HTML docs, `0` error docs.

33. `Rainier Springs`
   - Why here: specialty behavioral hospital.
   - Current DB state: `0` PDFs, `4` HTML docs, `0` error docs.

34. `Mann-Grandstaff VA Medical Center`
   - Why here: federal system, real impact but different acquisition dynamics than civilian systems.
   - Current DB state: `0` PDFs, `4` HTML docs, `0` error docs.

35. `VA Puget Sound Health Care System`
   - Why here: federal umbrella system.
   - Current DB state: `0` PDFs, `0` source docs.

36. `Madigan Army Medical Center`
   - Why here: federal military medical center.
   - Current DB state: `0` PDFs, `2` HTML docs, `2` error docs.

37. `Naval Hospital Bremerton`
   - Why here: federal military hospital.
   - Current DB state: `0` PDFs, `2` HTML docs, `2` error docs.

## 4. Cleanup / Likely Duplicate Or Non-Hospital Targets

38. `Virginia Mason Medical Center`
   - Reason to deprioritize: likely legacy duplicate now shadowed by `Virginia Mason Franciscan Health`, which already has a medical-records page and PDF captured.
   - Current DB state: `0` PDFs, `1` HTML doc, `0` error docs.

39. `Washington State Hospitals`
   - Reason to deprioritize: appears to be a directory/association-style seed, not a real care-delivery system.
   - Current DB state: `0` PDFs, `3` HTML docs, `3` error docs.

## Recommended WA Attack Order

1. `UW Medicine`
2. `EvergreenHealth`
3. `Confluence Health`
4. `Trios Health`
5. `Lourdes Health`
6. `Kittitas Valley Healthcare`
7. `Skagit Regional Health`
8. `Shriners Children's Spokane`
9. `Mary Bridge Children's Hospital`
10. `WhidbeyHealth`

Notes:
- `UW Medicine` and `EvergreenHealth` are the two biggest remaining zero-PDF misses by practical statewide impact.
- `Confluence Health` is the biggest regional miss.
- `Virginia Mason Franciscan Health` is no longer a zero-PDF miss.
- `MultiCare` is no longer a zero-PDF miss.
- `Virginia Mason Medical Center` and `Washington State Hospitals` should probably be treated as seed-cleanup items, not top crawl targets.
