# BP9 Production Center guide

Open <http://10.201.169.250:43871/>. manager / manager manages shared settings; member / member enters production, imports and reviews reports. The in-app User guide follows the logged-in role. Language choices are Chinese / English / Thai in every interface language.

## Manager: eight setup steps

1. **Master data & shift times:** maintain Lines, Models, Jobs, Stations. Add each allowed Line/Model pair with dropdowns; one line can use several models. Define production/break intervals for both shifts without overlap.
2. **Line daily targets:** set one preset per line/model before people or stations are complete. Every station starts with that preset allocated by production minutes across both shifts, excluding breaks.
3. **People by job:** use the complete job list, including empty jobs. Create, move or activate people. Removing a job deletes its directory people/assignments when saved; historical captured names remain.
4. **Assign people to lines:** choose Line/Model and a Job in each day/night/owner team. Tick several names and Add selected. The same job can have multiple people. Clear selection only clears pending ticks; X removes an assigned person. Empty-job guidance opens its roster.
5. **Line configuration:** choose a configured Line/Model with dropdowns. Only this pair’s configurations appear; old models are not suggested or copied. One table contains Job, Station, automatic people, Active and Delete. Its last row adds and enables a new pair. Uncheck Active to pause and keep the row; Delete removes it from the draft and Save settings publishes its removal. It stays deleted after reload. Re-adding the same pair creates a new identity without reviving old counts; historical reports remain. Existing pairs should be edited or enabled in their own row. Select **Output station** here; recheck it if you disable or delete its source. Deleting the last station leaves an empty configuration with the source selector disabled.
6. **Line groups:** organize physical lines and their models.
7. **Alerts & refresh:** configure gap/idle rules and refresh interval.
8. **Language & appearance:** shared defaults; browser preferences are in the header.

Save settings at top/bottom publishes the draft. Save draft stays in this browser/account. Page access checks actual prerequisites rather than locking every subsequent step. Version conflicts preserve drafts. Load saved settings confirms before discarding local changes.

![Integrated configuration](./images/line-configuration.png)

## Member: each station has its own counts

![Station production entry](./images/production-entry.png)

Choose production date, Line and Model. All stations appear automatically; there is no station selector. The fixed left column shows Job/Station and day/night/whole-day totals. Each interval has adjacent **Target / Actual** inputs and a one-line issue button. Individual edits affect only that station. People and owners remain automatically captured and can be viewed in production details.

Interval target = daily preset × interval production minutes ÷ total production minutes across both shifts. Breaks are excluded and rounding preserves the daily total for each station. A preset of 1,000 over 500 minutes gives a 20-minute interval 40. Changing one station’s Target to 50 changes only that station’s report-day total to 1,010, leaving other stations and the 1,000 preset unchanged.

Whole-day spreadsheet shows both shifts; Whole-shift spreadsheet shows the selected shift; Single-interval spreadsheet shows one slot. All modes keep Target/Actual and issue buttons. Day/night and whole-day Target/Actual totals stay with Job/Station in the fixed left column. Blank means not entered/unknown; 0 is explicit zero. Counts must be integers from 0 to 99,999,999.

Click another numeric cell to autosave and confirm Saved. Tab moves across intervals within the same field; Enter moves down stations. Paste a numeric rectangle into the same Target or Actual field across stations/intervals. Failed saves retain input. Review a station version conflict before Use latest data or Save my changed cells; only changed cells are merged and other stations stay independent.

Click **Add issue** or its preview, or press **F2** in a numeric cell. The editor identifies the station, date, shift and interval. Quick text inserts equipment, material or quality reasons; edit freely and use Enter for new lines, up to 2,000 characters. Done, X, Esc, Ctrl+Enter or a click outside closes and saves. Clear note removes the saved note. Opening without changes never creates a report. Long notes stay one line in the table; reopening shows the full text. F2 returns to the original numeric cell after closing. Save failures retain text and expose recovery controls beside the totals.

![Issue editor](./images/issue-editor.png)

## Saved station order

Managers drag the grip in the far-left Order column to place a station before or after another station in the same Line/Model. The sequence number follows the grip. Job and Station inputs align, and up/down buttons are in Actions. **Save settings** publishes the order to all entry modes, station details, fullscreen dialogs and Excel templates / CSV exports. Station IDs, people, targets and the selected output source remain intact.

## Fill an interval across all stations

![Interval fill](./images/interval-batch.png)

Click **Fill interval** at the left of the entry command bar. Select production date, Line, Model and interval. Edit Target, Actual and Issue for each station, or enter a shared value above and use its Apply button. Applying stays in the window for further edits. Confirmed multilingual issue quick text is also available. Blank shared fields preserve existing values; zero writes zero. Individual fields can be cleared.

**Save now** saves without closing. X, Esc or clicking outside saves before closing; invalid values or conflicts keep the window and drafts open. Changing date/unit/interval saves the original scope before loading the destination. Closing returns entry to that destination. A conflicting batch saves nothing; Refresh preview retains changed fields for review before retrying.

Paste adjacent Target/Actual columns into the batch sheet, or a single column alternating Target then Actual for each station. The main grid accepts paired rows across intervals: odd rows Target, even rows Actual, then the next station. Invalid or out-of-range rectangles are rejected in full. Other intervals and daily presets stay unchanged.

## Stations without output

Managers leave a station **Active** and uncheck **Produces output** to keep it visible without reporting. Save settings publishes the choice. Existing stations produce output by default. Non-output rows have no writable Target/Actual/Issue; expand saved history to read prior data. Batch fill and Excel templates skip these stations, and import rejects changes to them. CSV report export can still include their saved history. Re-enabling output restores entry without deleting earlier records. Output source choices include only enabled output-producing stations.

![No-output station](./images/no-output-station.png)

## Names and page addresses

Display headings omit the Model prefix and split at the first hyphen: `ECD16010094` then `(ORV3-PSU-3KW-AutoLine)`. Further hyphens remain inside the parentheses. Names without a hyphen use one line. Stored identifiers and Excel values remain unchanged.

Every page has its own address: `/overview`, `/details`, `/entry`, `/guide`. Manager setup paths are `/settings/master-data`, `/settings/daily-targets`, `/settings/people`, `/settings/assignments`, `/settings/line-configuration`, `/settings/groups`, `/settings/alerts` and `/settings/appearance`. Direct links, refresh and browser Back/Forward are supported. Settings steps share an unsaved draft; leaving still checks unsaved work. Member accounts cannot access shared settings by URL. Confirm Saved before refreshing.

## Missing configuration

A configured line/model with no enabled stations remains selectable and shows its target-allocation preview. Preview fields do not create reports. Managers can open the exact Line configuration, add/enable its job/station pairs and Save settings. Members see instructions to contact a manager. Do not delete catalogs or recreate people to make entry appear.

## Excel import

Expand **Excel import & templates**, download the production-date/shift template and retain identifiers. Enter Target, Actual and Issue on each station’s own rows; different counts at different stations are valid. Blank cells preserve saved values; 0 writes zero. The Excel menu offers whole-day, day-shift and night-shift templates and imports. A whole-day file contains both shifts.

CSV uses Row ID + Time slot, or an unambiguous Line + Model + Job/Station + Time slot. Line/model alone is rejected if it matches several stations. Preview all affected station rows before importing. Any stale station/configuration version rejects the entire batch. Historical station/model/interval identifiers remain supported.

![Excel preview](./images/excel-preview.png)

## Output source and monitoring

Each enabled line/model uses its selected **Output station** for dashboard target, output, gap, trends and alerts. Group totals add units, not every station traversed by the same products. Changing that source updates the active unit’s view immediately. Retired line/model combinations retain their captured historical source; saved station values remain intact.

Normal line clicks open details; full-screen clicks open a station-detail dialog. Closing retains the board group/page. Trend and share charts can be toggled independently. The board shows up to seven units per page, reserving space for long model names and charts. Names wrap, and phone daily-target cards retain field labels.

This pilot requires manual reporting; automatic data integration is planned for a future version. See the [manager walkthrough](./MANAGER_GUIDE.md), [member walkthrough](./MEMBER_GUIDE.md) and [validation record](./VALIDATION.md).
