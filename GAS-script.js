function doPost(e) {
    try {
        var mainSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('submissions');
        var data = JSON.parse(e.postData.contents);
        var headers = mainSheet.getRange(1, 1, 1, mainSheet.getLastColumn()).getValues()[0];

        // 1. Map Column Names to their Indexes (0-based)
        var colIndexMap = {};
        headers.forEach(function (head, idx) {
            if (head) colIndexMap[String(head).trim()] = idx;
        });

        // 2. User ID Lookup (Server-Side)
        var portalUsername = data["portalUsername"];
        var userId = "";

        if (portalUsername) {
            try {
                var lookupSpreadsheetId = "1gBaUaubciSj2b-ZD25PX-Orm-X6cRpy9gGx26pDOl8Q";
                var lookupSheet = SpreadsheetApp.openById(lookupSpreadsheetId).getSheets().find(function (s) {
                    return s.getSheetId() == 1433371720;
                }) || SpreadsheetApp.openById(lookupSpreadsheetId).getSheets()[0];

                var lookupData = lookupSheet.getDataRange().getValues();
                var lookupHeaders = lookupData[0];
                var lookupColMap = {};
                lookupHeaders.forEach(function (h, i) { lookupColMap[String(h).toLowerCase()] = i; });

                if (lookupColMap["username"] !== undefined && lookupColMap["id"] !== undefined) {
                    for (var j = 1; j < lookupData.length; j++) {
                        if (String(lookupData[j][lookupColMap["username"]]).toLowerCase() == portalUsername.toLowerCase()) {
                            userId = lookupData[j][lookupColMap["id"]];
                            break;
                        }
                    }
                }
            } catch (lookupErr) {
                userId = "Error: " + lookupErr.toString();
            }
        }

        // 3. Check for Existing Submissions
        var submissionId = String(data["Submission"] || "").trim();
        var subIdx = colIndexMap["Submission"];
        if (submissionId && subIdx !== undefined && mainSheet.getLastRow() > 1) {
            var existingIds = {};
            var destData = mainSheet.getRange(2, subIdx + 1, mainSheet.getLastRow() - 1, 1).getValues();
            for (var k = 0; k < destData.length; k++) {
                existingIds[String(destData[k][0]).trim()] = true;
            }
            
            if (existingIds[submissionId]) {
                return ContentService.createTextOutput(JSON.stringify({ "status": "exists", "message": "Submission already exists", "userId": userId }))
                    .setMimeType(ContentService.MimeType.JSON);
            }
        }

        // 4. Prepare the row for the main submission sheet
        var newRow = headers.map(function (header) {
            if (header == "User") return userId;
            return data[header] !== undefined ? data[header] : "";
        });

        var lastRow = mainSheet.getLastRow() + 1;
        var range = mainSheet.getRange(lastRow, 1, 1, newRow.length);


        // 5. Inherit format from the previous data row
        if (lastRow > 2) {
            var prevRange = mainSheet.getRange(lastRow - 1, 1, 1, newRow.length);
            prevRange.copyTo(range, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
        }

        // 6. Selectively apply Plain Text (@) to ID columns
        headers.forEach(function (header, i) {
            if (header === "Key" || header === "Submission" || header === "User") {
                mainSheet.getRange(lastRow, i + 1).setNumberFormat("@");
            }
        });

        // 7. Set the values
        range.setValues([newRow]);
        return ContentService.createTextOutput(JSON.stringify({ "status": "success", "userId": userId }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({ "status": "error", "message": err.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}
