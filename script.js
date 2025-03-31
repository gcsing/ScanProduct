document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const scanButton = document.getElementById('scanButton');
    const clearButton = document.getElementById('clearButton');
    const scannedItemsList = document.getElementById('scannedItemsList');
    const videoElement = document.getElementById('video');
    const scannerContainer = document.getElementById('scanner-container');
    const stopScanButton = document.getElementById('stopScanButton');
    const scanStatus = document.getElementById('scan-status');
    const csvFileInput = document.getElementById('csvFile');
    const dataStatus = document.getElementById('data-status');
    const manualBarcode = document.getElementById('manualBarcode');
    const manualAddButton = document.getElementById('manualAddButton');
    const manualStatus = document.getElementById('manual-status');

    // State Variables
    let productData = {}; // Holds product info { barcode: { name, uom, price } }
    let codeReader = null; // ZXing instance
    let isScanning = false;
    const STORAGE_KEY = 'barcodeScannerProductData'; // Key for localStorage

    // --- Data Management ---

    function loadDataFromLocalStorage() {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            try {
                productData = JSON.parse(storedData);
                const itemCount = Object.keys(productData).length;
                if (itemCount > 0) {
                    console.log(`Product data loaded from localStorage: ${itemCount} items`);
                    dataStatus.textContent = ` (${itemCount} items loaded)`;
                    dataStatus.style.color = 'green';
                    scanButton.disabled = false; // Enable scanning
                    manualAddButton.disabled = false; // Enable manual add
                    return true;
                }
            } catch (e) {
                console.error("Error parsing data from localStorage", e);
                localStorage.removeItem(STORAGE_KEY); // Clear corrupted data
            }
        }
        console.log("No valid data found in localStorage.");
        dataStatus.textContent = ' (No data loaded - Please upload CSV)';
        dataStatus.style.color = 'red';
        scanButton.disabled = true; // Keep disabled
        manualAddButton.disabled = true;
        return false;
    }

    function saveDataToLocalStorage() {
         const itemCount = Object.keys(productData).length;
        if (itemCount === 0) {
            console.warn("Attempted to save empty product data. Skipping.");
            return;
        }
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(productData));
            console.log(`Product data (${itemCount} items) saved to localStorage.`);
        } catch (e) {
             console.error("Error saving data to localStorage (maybe size limit exceeded?)", e);
             alert("Could not save data for next time. Local storage might be full.");
             localStorage.removeItem(STORAGE_KEY);
        }
    }

    function handleFileSelect(event) {
        console.log("handleFileSelect triggered.");
        const file = event.target.files[0];
        if (!file) {
            console.log("No file selected in event.");
            return;
        }
        console.log(`File selected: ${file.name}, Size: ${file.size}, Type: ${file.type}`);

        if (!file.name.toLowerCase().endsWith('.csv')) {
            alert("Please select a valid .csv file.");
            console.warn("Invalid file type selected.");
            event.target.value = null;
            return;
        }

        dataStatus.textContent = ' (Reading file...)';
        dataStatus.style.color = '#666';
        scanButton.disabled = true;
        manualAddButton.disabled = true; // Disable while loading

        const reader = new FileReader();

        reader.onload = function(e) {
            console.log("FileReader onload event fired.");
            const csvText = e.target.result;
            if (csvText) {
                console.log(`CSV text loaded (first 500 chars):\n${csvText.substring(0, 500)}`);
                parseCsvDataAndStore(csvText, file.name);
            } else {
                 console.error("FileReader result is empty.");
                 alert("Could not read content from the file.");
                 dataStatus.textContent = ' (Error reading file content)';
                 dataStatus.style.color = 'red';
            }
            event.target.value = null; // Reset input after processing
        };

        reader.onerror = function(e) {
            console.error("FileReader error event:", e);
            alert(`Error reading file: ${file.name}. Check console.`);
            dataStatus.textContent = ' (Error reading file)';
            dataStatus.style.color = 'red';
            event.target.value = null; // Reset input
        };

        reader.readAsText(file);
        console.log("FileReader readAsText called.");
    }

     function parseCsvDataAndStore(csvText, fileName) {
         console.log(`Attempting to parse CSV data from ${fileName || 'uploaded file'}...`);
         try {
             Papa.parse(csvText, {
                 header: true,
                 skipEmptyLines: true,
                 complete: function(results) {
                     console.log("PapaParse complete callback entered.");
                     console.log("Parsed results meta:", results.meta);
                     console.log("Parsed results errors:", results.errors);
                     console.log(`Parsed ${results.data.length} rows.`);

                     if (results.errors.length > 0) {
                         alert(`Errors found while parsing ${fileName || 'the file'}. Check console for details.`);
                         dataStatus.textContent = ' (Error parsing CSV)';
                         dataStatus.style.color = 'red';
                         productData = {};
                         localStorage.removeItem(STORAGE_KEY);
                         return;
                     }

                     const requiredColumns = ['BARCODE', 'PRODUCTNAME', 'UOM', 'SELLPRICE'];
                      const actualHeaders = results.meta.fields || [];
                      const missingColumns = requiredColumns.filter(col => !actualHeaders.includes(col));


                     if (missingColumns.length > 0) {
                        console.error("CSV headers missing required columns:", missingColumns.join(', '));
                        alert(`Error processing CSV: Missing required columns: ${missingColumns.join(', ')}.\nFound headers: ${actualHeaders.join(', ')}`);
                        dataStatus.textContent = ' (CSV missing columns)';
                        dataStatus.style.color = 'red';
                        productData = {};
                        localStorage.removeItem(STORAGE_KEY);
                        return;
                     }

                     console.log("Required columns found. Proceeding to populate productData.");
                     productData = {}; // Clear previous data
                     let validRows = 0;
                     results.data.forEach((row, index) => {
                         const barcode = row.BARCODE?.trim();
                         if (barcode) {
                             productData[barcode] = {
                                 name: row.PRODUCTNAME?.trim() || 'N/A',
                                 uom: row.UOM?.trim() || 'N/A',
                                 price: parseFloat(row.SELLPRICE) || 0
                             };
                             validRows++;
                         } else {
                            if (index < 10) {
                                console.warn(`Skipping row ${index + 1} due to empty barcode:`, row);
                            } else if (index === 10) {
                                console.warn("Further empty barcode warnings suppressed.");
                            }
                         }
                     });

                     const itemCount = Object.keys(productData).length;
                     console.log(`Finished processing rows. ${itemCount} valid products stored.`);

                     if (itemCount > 0) {
                         console.log("Attempting to save data to localStorage and update UI.");
                         saveDataToLocalStorage();
                         dataStatus.textContent = ` (${itemCount} items loaded)`;
                         dataStatus.style.color = 'green';
                         scanButton.disabled = false; // Enable scanning
                         manualAddButton.disabled = false; // Enable manual add
                         console.log("Scan and Add buttons enabled.");
                         alert(`Successfully loaded ${itemCount} products from ${fileName || 'the file'}.`);
                     } else {
                         console.warn('The CSV file had no rows with valid barcodes.');
                         alert('The CSV file seems empty or had no valid product rows.');
                         dataStatus.textContent = ' (Loaded file was empty or invalid)';
                         dataStatus.style.color = 'orange';
                         scanButton.disabled = true;
                         manualAddButton.disabled = true;
                         localStorage.removeItem(STORAGE_KEY);
                     }
                 },
                 error: function(error) {
                     console.error('PapaParse Error callback:', error);
                     alert(`Failed to parse CSV file: ${error.message}`);
                     dataStatus.textContent = ' (Error parsing CSV)';
                     dataStatus.style.color = 'red';
                      productData = {};
                      localStorage.removeItem(STORAGE_KEY);
                 }
             });
         } catch (error) {
             console.error('Error within parseCsvDataAndStore function:', error);
             alert('An unexpected error occurred during parsing.');
              dataStatus.textContent = ' (Parsing error)';
              dataStatus.style.color = 'red';
              productData = {};
              localStorage.removeItem(STORAGE_KEY);
         }
     }


    // --- Barcode Lookup ---
    function lookupBarcode(barcode) {
        return productData[barcode] || null;
    }

    // --- Display Logic ---
    function displayItem(barcode, product) {
        const listItem = document.createElement('li');
        listItem.dataset.barcode = barcode; // Store barcode

         const existingItem = scannedItemsList.querySelector(`li[data-barcode="${barcode}"]`);
         if (existingItem) {
             console.log(`Barcode ${barcode} already in list.`);
              // Update status differently for scan vs manual add if needed
              if (isScanning) {
                 scanStatus.textContent = `Already scanned: ${product.name}`;
              } else {
                 manualStatus.textContent = `Already in list!`;
                 manualStatus.style.color = 'orange';
              }
              existingItem.style.backgroundColor = '#fff3cd'; // Temporary highlight
              setTimeout(() => { existingItem.style.backgroundColor = ''; }, 1000);
               // Clear status message after a delay
               setTimeout(() => {
                   if (isScanning) scanStatus.textContent = 'Point camera at barcode...';
                   else manualStatus.textContent = '';
                }, 2000);
             return;
         }

        listItem.innerHTML = `
            <span>${barcode}</span>
            <span class="product-name">${product.name}</span>
            <span>${product.uom}</span>
            <span class="product-price">$${product.price.toFixed(2)}</span>
        `;
        scannedItemsList.prepend(listItem); // Add to top

        // Update status based on whether scanning or manual add
        if (isScanning) {
            scanStatus.textContent = `Scanned: ${product.name}`;
             setTimeout(() => { if (isScanning) scanStatus.textContent = 'Point camera at barcode...'; }, 2000);
        } else {
            // Manual add status is handled in handleManualAdd
        }
    }

    function clearList() {
        scannedItemsList.innerHTML = '';
        console.log('Displayed list cleared.');
    }

        // --- Scanning Logic ---
    async function startScan() {
        if (isScanning) return;
        if (Object.keys(productData).length === 0) {
            alert("No product data loaded. Please upload a CSV file first.");
            return;
        }

        // Instantiate the code reader immediately
        codeReader = new ZXing.BrowserMultiFormatReader();
        isScanning = true;
        scanButton.disabled = true; // Keep scan button disabled while actively scanning
        manualAddButton.disabled = true; // Disable manual add while scanning
        stopScanButton.style.display = 'inline-block'; // Show stop button
        scannerContainer.style.display = 'block';
        scanStatus.textContent = 'Requesting camera access...';

        try {
            console.log('Attempting to decode from video device...');
            scanStatus.textContent = 'Starting scanner... Point camera at barcode.';

            // Directly ask to decode from *any* video device.
            // Passing 'undefined' lets the library/browser try to choose.
            // This bypasses the problematic static listVideoInputDevices call.
            codeReader.decodeFromVideoDevice(undefined, 'video', (result, err) => {
                if (result) {
                    // Successfully decoded a barcode
                    const barcode = result.text;
                    console.log('Scan successful:', barcode); // Log raw result
                    const product = lookupBarcode(barcode);
                    if (product) {
                        displayItem(barcode, product);
                        navigator.vibrate?.(100); // Vibrate briefly if supported
                    } else {
                        console.log(`Barcode ${barcode} not found in data.`);
                        scanStatus.textContent = `Barcode ${barcode} not found.`;
                        setTimeout(() => { if (isScanning) scanStatus.textContent = 'Point camera at barcode...'; }, 2000);
                    }
                }
                // Check for errors, but ignore NotFoundException (normal when no barcode is in view)
                if (err && !(err instanceof ZXing.NotFoundException)) {
                    console.error('Scan error:', err);
                     // Display a more user-friendly error for common camera issues
                     if (err.name === 'NotAllowedError') {
                        scanStatus.textContent = 'Camera permission denied.';
                        alert('Camera permission was denied. Please allow camera access in your browser settings.');
                        stopScan(); // Stop if permission denied
                     } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                         scanStatus.textContent = 'No suitable camera found.';
                         alert('Could not find a suitable camera on this device.');
                         stopScan();
                     } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                          scanStatus.textContent = 'Camera is already in use or cannot be read.';
                          alert('Could not start the camera. It might be used by another application or browser tab.');
                          stopScan();
                     }
                     else {
                         scanStatus.textContent = 'Scanning error. Try again.';
                         alert(`An unexpected scanning error occurred: ${err.name}`);
                         stopScan(); // Stop on other critical errors
                     }
                    setTimeout(() => { if (isScanning) scanStatus.textContent = 'Point camera at barcode...'; }, 3000); // Reset prompt after error display
                }
                // Otherwise (err is NotFoundException), just continue scanning silently.
            });

            console.log(`Decode operation started successfully.`);

        } catch (error) {
            // This catch block handles errors during the *initialization* phase
            console.error('Error setting up scanner:', error);
            alert(`Error accessing camera or starting scan: ${error.message}`);
            scanStatus.textContent = 'Camera setup failed.';
            stopScan(); // Clean up on setup error
        }
    }

    // --- Manual Add Logic ---
    function handleManualAdd() {
        const barcodeValue = manualBarcode.value.trim();
        manualStatus.textContent = ''; // Clear previous status

        if (!barcodeValue) {
            manualStatus.textContent = 'Please enter a barcode.';
            manualStatus.style.color = 'orange';
            return;
        }

        if (Object.keys(productData).length === 0) {
            manualStatus.textContent = 'Product data not loaded.';
            manualStatus.style.color = 'red';
            return;
        }

        console.log(`Manual lookup for barcode: ${barcodeValue}`);
        const product = lookupBarcode(barcodeValue);

        if (product) {
            displayItem(barcodeValue, product); // Use existing display function
            manualBarcode.value = ''; // Clear input on success
            manualStatus.textContent = 'Added!';
            manualStatus.style.color = 'green';
        } else {
            console.log(`Manual barcode ${barcodeValue} not found.`);
            manualStatus.textContent = 'Barcode not found!';
            manualStatus.style.color = 'red';
        }
        // Clear status message after a delay
        setTimeout(() => { manualStatus.textContent = ''; }, 3000);
    }


    // --- Event Listeners ---
    csvFileInput.addEventListener('change', handleFileSelect, false);
    scanButton.addEventListener('click', startScan);
    clearButton.addEventListener('click', clearList);
    stopScanButton.addEventListener('click', stopScan);
    manualAddButton.addEventListener('click', handleManualAdd);
    manualBarcode.addEventListener('keydown', (event) => {
        manualStatus.textContent = ''; // Clear status on new key press
        if (event.key === 'Enter') {
            event.preventDefault();
            handleManualAdd();
        }
    });

    // --- Initial Load ---
    loadDataFromLocalStorage();

});
