function doPost(e) {
    try {
        var mainSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('submissions');
        var data = JSON.parse(e.postData.contents);
        var headers = mainSheet.getRange(1, 1, 1, mainSheet.getLastColumn()).getValues()[0];

        // 1. User ID Lookup (Server-Side)
        var portalUsername = data["portalUsername"];
        var userId = "";

        if (portalUsername) {
            try {
                var lookupSpreadsheetId = "1gBaUaubciSj2b-ZD25PX-Orm-X6cRpy9gGx26pDOl8Q";
                var lookupSheet = SpreadsheetApp.openById(lookupSpreadsheetId).getSheets().find(function (s) {
                    return s.getSheetId() == 1433371720;
                }) || SpreadsheetApp.openById(lookupSpreadsheetId).getSheets()[0];

                var lookupData = lookupSheet.getDataRange().getValues();
                var usernameCol = -1;
                var idCol = -1;

                // Find columns in lookup sheet
                var lookupHeaders = lookupData[0];
                for (var i = 0; i < lookupHeaders.length; i++) {
                    if (lookupHeaders[i].toString().toLowerCase() == "username") usernameCol = i;
                    if (lookupHeaders[i].toString().toLowerCase() == "id") idCol = i;
                }

                if (usernameCol !== -1 && idCol !== -1) {
                    for (var j = 1; j < lookupData.length; j++) {
                        if (lookupData[j][usernameCol].toString().toLowerCase() == portalUsername.toLowerCase()) {
                            userId = lookupData[j][idCol];
                            break;
                        }
                    }
                }
            } catch (lookupErr) {
                // Fallback or log if lookup sheet is inaccessible
                userId = "Error: " + lookupErr.toString();
            }
        }

        // 2. Prepare the row for the main submission sheet
        var newRow = headers.map(function (header) {
            if (header == "User") return userId;
            return data[header] !== undefined ? data[header] : "";
        });

        mainSheet.appendRow(newRow);
        return ContentService.createTextOutput(JSON.stringify({ "status": "success", "userId": userId }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({ "status": "error", "message": err.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}
