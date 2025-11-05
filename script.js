// --- GLOBAL STATE ---
let files = []; 
let mergedPreviewData = null; 
let downloadableDataAoA = []; 
let downloadableHeader = []; 

// --- DYNAMIC PREVIEW STATE ---
let previewColumnIndex = 9; // Default Column J (0-indexed)
// Store the actual headers for the dropdown display
let globalColumnHeaders = []; // Array of header strings ['A', 'B', 'C', ...] or ['ID', 'Value', 'Name', ...]
// Store the sheet number to be used (Sheet 2, index 1)
let globalSheetIndex = 1; // 🌟 MODIFIED: This is now the dynamic state variable

// --- CONSTANTS ---
const ROWS = 8;
const COLS = 12;
const GRID_SIZE = ROWS * COLS; // 96
const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

// Tailwind classes for coloring the data cells (using opacity /70 for readability)
const FILE_COLORS = [
    'bg-sky-100/70',   
    'bg-lime-100/70',  
    'bg-amber-100/70', 
    'bg-rose-100/70',  
    'bg-fuchsia-100/70', 
    'bg-teal-100/70',  
    'bg-orange-100/70',
    'bg-violet-100/70',
];

// --- WELL POSITION UTILITIES ---

/**
 * Generates an array of all 96 well positions (A1, B1, ..., H12).
 * @returns {string[]} Array of well positions.
 */
function generateAllWells() {
    const wells = [];
    for (let c = 1; c <= COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
            wells.push(rowLabels[r] + c);
        }
    }
    return wells;
}

const ALL_WELLS = generateAllWells();

/**
 * Converts a well position (e.g., 'C4') into its 1D index (0-95) 
 * based on column-wise filling (A1=0, B1=1, ..., H1=7, A2=8, ...).
 * @param {string} well - The well position string.
 * @returns {number} The 0-indexed position in the 96-cell sequence, or 0 if invalid.
 */
function wellTo1DIndex(well) {
    if (!well) return 0;
    const rowLetter = well.charAt(0).toUpperCase();
    const colNumber = parseInt(well.substring(1), 10);

    const r = rowLetter.charCodeAt(0) - 'A'.charCodeAt(0); // 0-7
    const c = colNumber - 1; // 0-11

    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) {
        return 0; // Default to A1 if invalid
    }

    // Column-wise filling: index = col * ROWS + row
    return c * ROWS + r;
}

/**
 * Converts a 1D index (0-95) back to a well position (e.g., 'C4').
 * @param {number} index - The 0-indexed position in the 96-cell sequence.
 * @returns {string|null} The well position string, or null if out of bounds.
 */
function indexToWell(index) {
    if (index < 0 || index >= GRID_SIZE) return null;
    const c = Math.floor(index / ROWS); // Column index (0-11)
    const r = index % ROWS; // Row index (0-7)
    return rowLabels[r] + (c + 1);
}

// --- UTILITY SVGs (Replaces Lucide Icons) ---
const svgIcons = {
    X: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>`
};

// --- COLLISION LOGIC ---

/**
 * Calculates the occupied well indices for all files UP TO (but not including) fileIndex.
 * It also validates the current file's selection against the newly calculated occupied set
 * and automatically resets the startWell if a collision is detected.
 * @param {number} fileIndex - The index of the file being processed/validated.
 * @returns {Set<number>} A set of 1D indices (0-95) that are occupied by preceding files.
 */
function getPrecedingOccupiedIndices(fileIndex) {
    const occupiedIndices = new Set();
    let currentFile = null;

    // 1. Calculate occupied indices by all files BEFORE the current one
    for (let i = 0; i < fileIndex; i++) {
        const prevFile = files[i];
        if (prevFile.previewCellCount > 0) {
            const start = wellTo1DIndex(prevFile.startWell);
            // Mark all cells this file occupies as occupied
            for (let j = 0; j < prevFile.previewCellCount; j++) {
                const index = start + j;
                if (index < GRID_SIZE) {
                    occupiedIndices.add(index);
                }
            }
        }
    }

    // 2. Validate the current file's startWell and reset if necessary
    currentFile = files[fileIndex];

    if (currentFile && currentFile.previewCellCount > 0) {
        const requiredLength = currentFile.previewCellCount;
        let currentStart = wellTo1DIndex(currentFile.startWell);
        let isValid = true;

        // Check 1: Boundary check
        if (currentStart + requiredLength > GRID_SIZE) {
            isValid = false;
        } else {
            // Check 2: Collision check against preceding files
            for (let j = 0; j < requiredLength; j++) {
                 if (occupiedIndices.has(currentStart + j)) {
                     isValid = false;
                     break;
                 }
            }
        }

        // If current selection is invalid, find the first available well and update the state
        if (!isValid) {
            const firstAvailableWell = findFirstAvailableWell(occupiedIndices, requiredLength);

            if (firstAvailableWell) {
                // Check if a correction is actually happening
                if (currentFile.startWell !== firstAvailableWell) {
                     console.warn(`Collision or boundary violation detected for ${currentFile.name}. Auto-correcting Start Well from ${currentFile.startWell} to ${firstAvailableWell}. (File Index: ${fileIndex + 1})`);
                     currentFile.startWell = firstAvailableWell; 
                }
            } else {
                // If no space is available, the startWell remains what it was, but the options will be disabled.
            }
        }
    }

    return occupiedIndices;
}

/**
 * Finds the first 1D index (0-95) that can accommodate the requiredLength
 * without colliding with the occupiedIndices set.
 */
function findFirstAvailableWell(occupiedIndices, requiredLength) {
    for (let start = 0; start <= GRID_SIZE - requiredLength; start++) {
        let isAvailable = true;
        for (let j = 0; j < requiredLength; j++) {
            const checkIndex = start + j;
            if (occupiedIndices.has(checkIndex)) {
                isAvailable = false;
                // Optimization: skip past the well that caused the collision
                start = checkIndex; 
                break;
            }
        }
        if (isAvailable) {
            return indexToWell(start); // Convert 1D index back to well string
        }
    }
    return null; // No available slot found
}

// --- CORE LOGIC ---

/**
 * The main function to run after any state change (upload, reorder, well change, column change, sheet change).
 * The order of execution is crucial here.
 */
function updateApp() {
    // 1. Render file list (runs collision/correction logic on startWell)
    renderFileList(); 
    
    // 2. Merge data (MUST run after renderFileList)
    // This step calculates globalColumnHeaders and mergedPreviewData.
    mergeData(); 
    
    // 3. Render components that depend on merged data/headers
    renderColumnSelect(); // Now depends on globalColumnHeaders from mergeData
    renderMergedData();
}

/**
 * Utility function to check if a row is completely empty.
 */
function isRowEmpty(row) {
    return row.every(cell => (cell === undefined || cell === null || cell === ''));
}

/**
 * Core merging logic:
 * 1. Determines the universal maximum column count.
 * 2. Extracts and pads ALL columns for the downloadable file (downloadableDataAoA) from FILTERED non-header rows (up to 96).
 * 3. Extracts Column [previewColumnIndex] data, positions it based on startWell, and generates the 8x12 preview (mergedPreviewData).
 * 4. Populates globalColumnHeaders for the dropdown display.
 */
function mergeData() {
    downloadableDataAoA = [];
    downloadableHeader = [];
    mergedPreviewData = null;
    globalColumnHeaders = []; // Reset global headers

    if (files.length === 0) {
        return;
    }

    let maxOriginalColumns = 0;
    const currentSheetIndex = globalSheetIndex; // Use the dynamic index

    // --- Pass 1: Determine Max Column Count (N) ---
    files.forEach(file => {
        const fileSheetData = file.sheetData[currentSheetIndex]; // 🌟 MODIFIED
        if (fileSheetData && fileSheetData.length > 0) {
            // Check the length of the header row (index 0)
            maxOriginalColumns = Math.max(maxOriginalColumns, fileSheetData[0].length);
        }
    });

    // --- Pass 2: Define Universal Header and Global Column Headers ---
    let firstFileSheetData = files[0].sheetData[currentSheetIndex]; // 🌟 MODIFIED
    if (!firstFileSheetData || firstFileSheetData.length === 0) {
         console.error(`First file is missing Sheet ${currentSheetIndex + 1} data.`);
         return;
    }

    let firstFileHeader = firstFileSheetData[0] || [];
    let paddedHeader = [...firstFileHeader.map(h => h || '')];

    // Pad the header to the max width found across all files
    while (paddedHeader.length < maxOriginalColumns) {
        // If a file is narrower, we use an empty string as a placeholder header
        paddedHeader.push(''); 
    }

    // Set the downloadable header
    downloadableHeader = ['Well Position', ...paddedHeader]; 
    downloadableHeader.push('Source File'); // The last column

    // Set the global column headers for the dropdown, falling back to column letter for empty headers
    // The displayName is the actual header or the column letter if blank.
    globalColumnHeaders = paddedHeader.map((header, index) => {
         const headerString = String(header || '').trim();
         return headerString !== '' ? headerString : getColumnName(index);
    });

    // Create a flat 1D grid (96 slots) initialized with empty placeholders
    const finalGrid1D = Array.from({ length: GRID_SIZE }, () => ({ value: '', sourceColor: '' }));


    // --- Pass 3: Process and Align Data for All Files ---
    files.forEach((file, fileIndex) => {
        const fileColor = FILE_COLORS[fileIndex % FILE_COLORS.length];
        const fileSheetData = file.sheetData[currentSheetIndex]; // 🌟 MODIFIED

        if (!fileSheetData || fileSheetData.length <= 1) { 
            return;
        }

        const dataRows = fileSheetData.slice(1);
        const filteredDataRows = dataRows.filter(row => !isRowEmpty(row));
        const rowsToProcess = filteredDataRows.slice(0, file.previewCellCount);


        // --- 1. DOWNLOADABLE DATA PREPARATION (ALL COLUMNS) ---
        rowsToProcess.forEach((row, dataRowIndex) => {
            // New logic: Pad the data row to maxOriginalColumns
            let paddedRowValues = [...row];
            while (paddedRowValues.length < maxOriginalColumns) {
                paddedRowValues.push('');
            }

            downloadableDataAoA.push({
                values: paddedRowValues, // Store the padded row values
                sourceColor: fileColor,
                sourceName: file.name,
                sequentialIndex: dataRowIndex 
            });
        });


        // --- 2. PREVIEW DATA PREPARATION (SELECTED COLUMN ONLY) ---
        const filePreviewCells = rowsToProcess
            .map(row => {
                // Take the value from the currently selected column index (or empty string if undefined/null)
                // If the file is narrower than the selected column index, this will also be an empty string
                const cellValue = row[previewColumnIndex] || '';

                return {
                    value: cellValue,
                    sourceColor: fileColor,
                    sourceName: file.name
                };
            });

        const start = wellTo1DIndex(file.startWell);

        // Place this file's data into the 1D grid
        filePreviewCells.forEach((cell, i) => {
            const targetIndex = start + i;
            if (targetIndex < GRID_SIZE) {
                finalGrid1D[targetIndex] = cell;
            }
        });

    }); // End files.forEach


    // --- 4. CONVERT 1D GRID TO 2D 8x12 GRID ---
    
    // Define the current header name for display/error messages
    const currentHeader = globalColumnHeaders[previewColumnIndex] || getColumnName(previewColumnIndex);
    const currentSheetNameDisplay = files[0].sheetData[currentSheetIndex] ? `Sheet ${currentSheetIndex + 1}` : 'Selected Sheet'; // Fallback display name

    const totalPopulatedCells = finalGrid1D.filter(cell => cell.value !== '').length;

    if (files.length > 0 && totalPopulatedCells === 0) {
         // Check if the selected column index itself is out of range for ALL files
         let isColumnOutOfRange = true;
         files.forEach(file => {
             const fileSheetData = file.sheetData[currentSheetIndex]; // 🌟 MODIFIED
             if (fileSheetData && fileSheetData.length > 0 && fileSheetData[0].length > previewColumnIndex) {
                 isColumnOutOfRange = false;
             }
         });
         
         // Use the display name from the logic in renderMergedData
         const letterName = getColumnName(previewColumnIndex);
         const displayHeaderName = currentHeader === letterName ? `Column ${currentHeader}` : `${currentHeader} (${letterName})`;

         // 🌟 MODIFIED ERROR MESSAGE to include the current sheet
         if (isColumnOutOfRange) {
             mergedPreviewData = [[`Selected ${displayHeaderName} is out of range for all files in ${currentSheetNameDisplay}.`]];
         } else {
             mergedPreviewData = [[`No data found in ${displayHeaderName} (${currentSheetNameDisplay}) after processing.`]];
         }
         
         return;
    } else if (files.length === 0) {
         mergedPreviewData = null;
         return;
    }

    const gridData = [];
    for (let r = 0; r < ROWS; r++) {
        gridData[r] = [];
        for (let c = 0; c < COLS; c++) {
            const index = c * ROWS + r;
            gridData[r][c] = finalGrid1D[index];
        }
    }

    mergedPreviewData = gridData;
}

// --- FILE HANDLERS ---

/**
 * Processes uploaded files using the XLSX library.
 */
async function handleFileUpload(fileList) {
    if (typeof XLSX === 'undefined' || !XLSX) {
        console.error("XLSX library failed to load.");
        return;
    }

    const uploadedFiles = Array.from(fileList);
    const currentSheetIndex = globalSheetIndex; // Use the dynamic index

    const processedFiles = await Promise.all(
        uploadedFiles.map(async (file) => {
            try {
                const data = await file.arrayBuffer();
                const workbook = XLSX.read(data);

                const sheetData = [];

                // Extract data from all sheets, but specifically check the selected Sheet availability
                workbook.SheetNames.forEach((name, index) => {
                    const worksheet = workbook.Sheets[name];
                    // We extract ALL sheets data and store it, so when the sheet index changes, 
                    // we don't have to re-upload.
                    sheetData[index] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                });

                const sheetNameForDisplay = workbook.SheetNames[currentSheetIndex] || `Sheet ${currentSheetIndex + 1} (Missing)`;
                const sheetDataForProcessing = sheetData[currentSheetIndex] || []; // 🌟 MODIFIED

                const dataRowsToProcess = sheetDataForProcessing.length > 0 ? sheetDataForProcessing.slice(1) : [];
                const filteredDataRows = dataRowsToProcess.filter(row => !isRowEmpty(row));
                const filteredRowsCount = filteredDataRows.length;

                // previewCellCount is the number of non-empty non-header rows, capped at 96
                const previewCellCount = Math.min(filteredRowsCount, GRID_SIZE); 

                return {
                    id: Math.random().toString(36).substr(2, 9),
                    name: file.name,
                    dataRows: filteredRowsCount, // Non-empty rows count for display (UNCAPPED)
                    previewCellCount: previewCellCount, // Capped at 96 (Used for positioning/collision)
                    sheetData: sheetData, // Array containing data for ALL sheets
                    sheetName: sheetNameForDisplay,
                    startWell: 'A1' // Default starting well
                };
            } catch (error) {
                console.error("Error processing file:", file.name, error);
                return null;
            }
        })
    );

    const successfulFiles = processedFiles.filter(f => f !== null);
    files = [...files, ...successfulFiles];

    updateApp();
}

/**
 * Updates the starting well position for a file.
 */
function handleWellChange(fileId, newWell) {
    const fileIndex = files.findIndex(f => f.id === fileId);
    if (fileIndex > -1) {
        files[fileIndex].startWell = newWell; 
        updateApp();
    }
}

/**
 * Updates the preview column index globally.
 */
function handleColumnChange(newIndex) {
    // Ensure the new index is a valid number
    const newIndexNum = parseInt(newIndex, 10);
    if (!isNaN(newIndexNum) && newIndexNum >= 0) {
        previewColumnIndex = newIndexNum;
        updateApp();
    }
}

/**
 * 🌟 NEW HANDLER 🌟
 * Updates the preview sheet index globally.
 */
function handleSheetIndexChange(newIndex) {
    const newIndexNum = parseInt(newIndex, 10);
    if (!isNaN(newIndexNum) && newIndexNum >= 0) {
        globalSheetIndex = newIndexNum;
        updateApp();
    }
}

/**
 * Removes a file from the list by its ID.
 */
function removeFile(id) {
    files = files.filter(f => f.id !== id);
    updateApp();
}

/**
 * Downloads the full concatenated data (ALL columns from the SELECTED sheet).
 */
function downloadMerged() {
    if (typeof XLSX === 'undefined' || !XLSX || files.length === 0) return;

    // downloadableHeader is now guaranteed to be aligned and correctly sized (N+2 columns)
    const expectedDataColumnsLength = downloadableHeader.length - 1; 

    // 1. Initialize the 96-well final grid with all WELL POSITIONS
    const final96WellGrid = ALL_WELLS.map(well => {
        // The empty row must be the size of the final downloadableHeader.
        const emptyRow = new Array(downloadableHeader.length).fill('');
        emptyRow[0] = well; // Well Position is the first column
        return emptyRow;
    });

    // 2. Start the final output array with the header, followed by the 96 empty well rows
    const finalAoA = [downloadableHeader, ...final96WellGrid]; 

    // 3. Populate the grid with merged data by overwriting the empty rows
    downloadableDataAoA.forEach(rowObj => {
        const sourceFile = files.find(f => f.name === rowObj.sourceName);

        if (sourceFile) {
            const start1DIndex = wellTo1DIndex(sourceFile.startWell);
            const final1DIndex = start1DIndex + rowObj.sequentialIndex; 

            if (final1DIndex >= 0 && final1DIndex < GRID_SIZE) {

                const targetIndexInAoA = final1DIndex + 1; 

                // Build the data portion of the row: [Padded Original Values..., Source File Name]
                // rowObj.values is already padded to maxOriginalColumns
                const finalDataRowValues = [...rowObj.values];
                finalDataRowValues.push(rowObj.sourceName); // Add Source File name (N+1 columns)

                // Overwrite the values in the final AoA row (skip the first element which is the Well Position)
                // Splice replaces the expected number of data columns starting at index 1.
                finalAoA[targetIndexInAoA].splice(1, expectedDataColumnsLength, ...finalDataRowValues);
            }
        }
    });

    // 4. Create a worksheet from the Array of Arrays
    const ws = XLSX.utils.aoa_to_sheet(finalAoA);
    const wb = XLSX.utils.book_new();
    
    // 🌟 MODIFIED: Include the sheet index in the download filename
    const sheetNum = globalSheetIndex + 1;
    XLSX.utils.book_append_sheet(wb, ws, `Sheet${sheetNum}_Concatenated`);

    // 5. Write and download the file
    XLSX.writeFile(wb, `full_sheet${sheetNum}_concatenated_data_96wells.xlsx`);
}

// --- RENDERING FUNCTIONS ---

/**
 * Converts a 0-indexed column number to its Excel letter representation (0=A, 25=Z, 26=AA).
 */
function getColumnName(index) {
    let name = '';
    let num = index + 1;
    while (num > 0) {
        let mod = (num - 1) % 26;
        name = String.fromCharCode(65 + mod) + name;
        num = Math.floor((num - 1) / 26);
    }
    return name;
}

/**
 * Generates options for the column select dropdown.
 * @param {string[]} headers - Array of header strings (e.g., ['A', 'B', 'C'] or ['ID', 'Value']).
 */
function generateColumnOptions(headers) {
    const options = [];
    // Cap at 50 columns to keep the dropdown manageable
    const maxIndex = Math.min(headers.length, 50); 
    
    for (let i = 0; i < maxIndex; i++) {
        const header = headers[i];
        const letterName = getColumnName(i);
        const selected = i === previewColumnIndex ? 'selected' : '';
        
        let displayName = header;
        // Truncate long headers
        if (header.length > 30) {
             displayName = `${header.substring(0, 27)}...`;
        }

        // Check if the header is an Excel column letter (meaning it's a fallback)
        let isFallback = header === letterName;

        const optionText = isFallback 
            ? `Column ${header}` // e.g., Column J
            : `${displayName} (${letterName})`; // e.g., Concentration (B)
        
        options.push(`<option value="${i}" ${selected}>${optionText}</option>`);
    }
    return options.join('');
}


/**
 * Renders the global column selection dropdown.
 */
function renderColumnSelect() {
    const selectElement = document.getElementById('preview-column-select');
    if (!selectElement) return;

    let headers = [];
    let maxColumns = 26; // Default to A-Z

    if (files.length > 0 && globalColumnHeaders.length > 0) {
        // Use the headers calculated in mergeData
        headers = globalColumnHeaders; 
    } else {
        // No files uploaded or files are empty, use A-Z column letters as placeholders
        for (let i = 0; i < maxColumns; i++) {
            headers.push(getColumnName(i));
        }
    }
    
    // Generate options using the determined headers
    selectElement.innerHTML = generateColumnOptions(headers); 

    // Ensure the currently selected value is correct if the index is out of bounds of the new headers
    if (previewColumnIndex >= headers.length && headers.length > 0) {
         previewColumnIndex = 0; // Reset to A1 if column is now out of range
         selectElement.value = "0";
    } else {
         selectElement.value = String(previewColumnIndex);
    }
}


function renderFileItem(file, index) {
    const item = document.createElement('div');
    item.id = `file-item-${file.id}`; 
    item.className = 'file-item flex flex-col md:flex-row items-start md:items-center justify-between bg-gray-50 p-3 rounded-xl shadow-sm border border-gray-100 transition-all duration-150 ease-in-out hover:bg-gray-100 hover:shadow-md space-y-2 md:space-y-0';

    const fileColor = FILE_COLORS[index % FILE_COLORS.length].replace('/70', '');

    // --- COLLISION CHECK AND DROPDOWN GENERATION ---

    // 1. Get the wells already occupied by files BEFORE this one.
    const occupiedIndices = getPrecedingOccupiedIndices(index); 

    const requiredLength = file.previewCellCount;

    // 2. Build the options for the dropdown dynamically
    const wellOptions = ALL_WELLS.map((well, wellIndex) => {
        let isDisabled = false;
        let title = '';

        // Check if the starting position itself is occupied by a previous file
        if (occupiedIndices.has(wellIndex)) {
            isDisabled = true;
            title = 'Occupied by a preceding file.';
        } 
        // Check if the required length exceeds the grid boundary from this start position
        else if (wellIndex + requiredLength > GRID_SIZE) {
            isDisabled = true;
            title = 'Not enough space remaining for this file.';
        } 
        // Check if any of the required cells (from start to start + length) are occupied by a previous file
        else {
            for (let j = 0; j < requiredLength; j++) {
                if (occupiedIndices.has(wellIndex + j)) {
                    isDisabled = true;
                    title = 'Overlap with a preceding file.';
                    break;
                }
            }
        }

        return `<option 
            value="${well}" 
            ${file.startWell === well ? 'selected' : ''} 
            ${isDisabled ? 'disabled' : ''} 
            ${isDisabled ? `title="${title}"` : ''} 
            class="${isDisabled ? 'bg-gray-200 text-gray-400' : ''}"
        >
            ${well}
        </option>`;
    }).join('');


    // 🌟 MODIFIED: Update display to show the selected sheet name
    const sheetNameDisplay = file.sheetData[globalSheetIndex] 
        ? file.sheetData[globalSheetIndex][0] ? `Sheet ${globalSheetIndex + 1}` : file.sheetName // Use extracted sheet name or fallback
        : `Sheet ${globalSheetIndex + 1} (Missing)`;
    
    item.innerHTML = `
        <div class="flex items-center gap-3 flex-1 min-w-0 w-full">
            <div class="w-2.5 h-2.5 rounded-full ${fileColor} shadow-md flex-shrink-0"></div> 
            <div class="flex flex-col min-w-0 flex-1">
                <span class="font-semibold text-gray-800 truncate text-sm" title="${file.name}">${file.name}</span>
                <span class="text-xs text-indigo-500">
                    (${file.dataRows} Samples from ${sheetNameDisplay}) 
                </span>
            </div>
        </div>

        <div class="flex items-center gap-2 flex-shrink-0 w-full md:w-auto md:ml-4">

            <select
                id="start-well-${file.id}"
                data-file-id="${file.id}"
                class="start-well-select block w-full text-xs py-1 px-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-gray-700 bg-white"
                ${requiredLength === 0 || requiredLength > GRID_SIZE ? 'disabled' : ''}
                title="${requiredLength === 0 ? `No non-empty data rows found in ${sheetNameDisplay}.` : (requiredLength > GRID_SIZE ? 'File data exceeds grid size (96).' : '')}"
            >
                ${wellOptions}
            </select>

            <button
                data-file-id="${file.id}"
                aria-label="Remove file ${file.name}"
                class="remove-file-btn text-red-500 hover:text-red-700 transition-colors p-1 rounded-full hover:bg-red-100 flex-shrink-0"
            >
                ${svgIcons.X}
            </button>
        </div>
    `;

    // Attach remove listener
    item.querySelector('.remove-file-btn').addEventListener('click', () => removeFile(file.id));

    // Attach start well change listener
    item.querySelector('.start-well-select').addEventListener('change', (e) => handleWellChange(file.id, e.target.value));

    return item;
}

function renderFileList() {
    const container = document.getElementById('file-list-container');
    const listElement = document.getElementById('file-list');
    const headerElement = document.getElementById('file-list-header');

    if (files.length === 0) {
        container.classList.add('hidden');
        listElement.innerHTML = '';
        return;
    }

    container.classList.remove('hidden');
    headerElement.textContent = `Uploaded Files (${files.length})`;

    listElement.innerHTML = '';
    files.forEach((file, index) => {
        listElement.appendChild(renderFileItem(file, index));
    });
}

// ---------------------------------------------------------------------------------
// 🌟 MODIFIED SECTION: renderMergedData with the Warning Popup fix
// ---------------------------------------------------------------------------------
function renderMergedData() {
    const viewContainer = document.getElementById('merged-data-view');
    const tableContainer = document.getElementById('merged-table-container');
    const downloadButton = document.getElementById('download-button');
    const summaryInfo = document.getElementById('summary-info');
    const columnDisplay = document.getElementById('current-column-display');
    
    // --- Determine current column display name and sheet name ---
    const currentHeader = globalColumnHeaders[previewColumnIndex] || getColumnName(previewColumnIndex);
    const letterName = getColumnName(previewColumnIndex);
    
    let displayHeaderName;
    // If the header is just a column letter, display "Column J", otherwise "Concentration (J)"
    if (currentHeader === letterName) {
        displayHeaderName = `Column ${currentHeader}`;
    } else {
        displayHeaderName = `${currentHeader} (${letterName})`;
    }
    
    // 🌟 NEW: Get sheet name for display
    const currentSheetIndex = globalSheetIndex;
    let sheetDisplayName = `Sheet ${currentSheetIndex + 1}`;
    if (files.length > 0 && files[0].sheetData[currentSheetIndex]) {
         // Try to get the sheet name from the first file's stored data
         const workbookSheetName = files[0].sheetData[currentSheetIndex].sheetName; 
         if (workbookSheetName && workbookSheetName.toLowerCase() !== sheetDisplayName.toLowerCase()) {
              sheetDisplayName = workbookSheetName;
         }
    }
    

    if (columnDisplay) {
         columnDisplay.textContent = displayHeaderName;
    }

    if (!mergedPreviewData) {
        viewContainer.classList.add('hidden');
        downloadButton.disabled = true;
        return;
    }

    viewContainer.classList.remove('hidden');
    downloadButton.disabled = false;

    // --- FIX 1: Calculate the total uncapped sample count here (from file.dataRows) ---
    const totalUncappedSamples = files.reduce((sum, file) => {
        // Only count samples if the file contains data for the selected sheet
        const fileSheetData = file.sheetData[globalSheetIndex];
        return sum + (fileSheetData && fileSheetData.length > 1 ? file.dataRows : 0);
    }, 0);

    // Calculate the number of cells actually populated in the 8x12 grid (max 96)
    const totalPopulatedPreviewCells = mergedPreviewData.reduce((sum, row) => sum + row.filter(cell => cell.value !== undefined && cell.value !== '').length, 0);

    // -------------------------------------------------------------------
    // >>> MODIFIED WARNING POPUP LOGIC <<<
    // -------------------------------------------------------------------
    if (totalUncappedSamples > GRID_SIZE) { // GRID_SIZE is 96
        const overflow = totalUncappedSamples - GRID_SIZE;
        // The message is now based on the total *available* samples.
        alert(`⚠️ Warning: Total number of samples across all files in ${sheetDisplayName} is ${totalUncappedSamples}. Only the first 96 samples will be displayed/included in the final 96-well grid.`);
    }
    // -------------------------------------------------------------------
    
    // --- FIX 2: Update summary info to show both uncapped and preview totals ---
    summaryInfo.innerHTML = `
        Total samples: <span class="font-semibold text-green-700">${totalPopulatedPreviewCells}</span> | 
        Previewing <span class="font-semibold text-green-700">${displayHeaderName}</span> from <span class="font-semibold text-green-700">${sheetDisplayName}</span>
    `;

    // 1. Build the table HTML (8x12 fixed grid, using mergedPreviewData)
    let tableHTML = `
        <table id="merged-data-table" class="min-w-full divide-y divide-gray-200 border-collapse">
            <thead class="bg-gray-100 sticky top-0">
                <tr>
                    <th class="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider min-w-[30px] sticky left-0 z-20"></th> 
                    ${[...Array(COLS)].map((_, i) => `
                        <th class="px-2 py-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider min-w-[50px]">
                            ${i + 1}
                        </th>
                    `).join('')}
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-100">
    `;

    // Check if it's the simple 'No data found' message
    if (mergedPreviewData.length === 1 && typeof mergedPreviewData[0][0] === 'string') {
         tableHTML += `
             <tr>
                 <td colspan="${COLS + 1}" class="px-4 py-6 text-center text-base text-red-500 bg-red-50 font-semibold">
                     ${mergedPreviewData[0][0]}
                 </td>
             </tr>
         `;
    } else {
        // Render data rows
        mergedPreviewData.forEach((row, i) => {
            tableHTML += `
                <tr class="hover:bg-gray-50 transition-colors">
                    <td class="row-label px-2 py-2 text-center text-xs font-bold text-gray-800 bg-gray-100 border-r border-gray-200 sticky left-0 z-10 min-w-[30px] whitespace-nowrap">
                        ${rowLabels[i]}
                    </td>
                    ${row.map((cellObj, j) => {
                        const cellValue = cellObj.value || '';
                        const cellColorClass = cellObj.sourceColor || ''; // Apply the color class with opacity

                        return `
                            <td 
                                class="px-2 py-2 text-xs text-gray-700 text-center border-r border-gray-100 last:border-r-0 ${cellColorClass}"
                            >
                                ${cellValue}
                            </td>
                        `;
                    }).join('')}
                </tr>
            `;
        });
    }

    tableHTML += `
            </tbody>
        </table>
    `;

    tableContainer.innerHTML = tableHTML;
}
// ---------------------------------------------------------------------------------
// 🌟 END MODIFIED SECTION
// ---------------------------------------------------------------------------------


// --- INITIALIZATION ---

function init() {
    const fileInput = document.getElementById('file-input');
    const dropArea = document.getElementById('drop-area');
    const downloadButton = document.getElementById('download-button');
    const columnSelect = document.getElementById('preview-column-select');
    const sheetSelect = document.getElementById('sheet-index-select'); // 🌟 NEW ELEMENT

    // 1. File Input Listener
    fileInput.addEventListener('change', (e) => {
        handleFileUpload(e.target.files);
        e.target.value = ''; 
    });

    // 2. Download Listener
    downloadButton.addEventListener('click', downloadMerged);
    
    // 3. Column Select Listener
    if (columnSelect) {
        columnSelect.addEventListener('change', (e) => {
            handleColumnChange(e.target.value);
        });
    }

    // 4. 🌟 NEW Sheet Select Listener
    if (sheetSelect) {
        sheetSelect.addEventListener('change', (e) => {
            handleSheetIndexChange(e.target.value);
        });
    }

    // 5. Drop Area Listeners
    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault(); 
        dropArea.classList.add('drag-over-target');
    });

    dropArea.addEventListener('dragleave', () => {
        dropArea.classList.remove('drag-over-target');
    });

    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dropArea.classList.remove('drag-over-target');
        if (e.dataTransfer.files.length) {
            handleFileUpload(e.dataTransfer.files);
        }
    });

    // Prevent drag-and-drop file opening for the entire document
    document.body.addEventListener('dragover', (e) => e.preventDefault());
    document.body.addEventListener('drop', (e) => e.preventDefault());

    // Initial render of the column select (will show A-Z)
    renderColumnSelect(); 
    updateApp(); // Also calls renderColumnSelect/renderMergedData
}

window.onload = init;