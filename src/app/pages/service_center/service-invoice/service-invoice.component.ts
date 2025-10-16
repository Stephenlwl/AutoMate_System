import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Firestore, doc, getDoc, collection, setDoc, updateDoc, Timestamp, query, where, getDocs } from '@angular/fire/firestore';
import { ReactiveFormsModule, FormBuilder, FormsModule } from '@angular/forms';
import { AuthService } from '../auth/service-center-auth';
import { reload } from 'firebase/auth';

@Component({
  selector: 'app-service-invoice',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './service-invoice.component.html'
})
export class ServiceInvoiceComponent implements OnInit {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  adminName: string | null = null;
  serviceCenterName: string | null = null;
  booking: any = null;
  invoice: any = null;
  invoiceId: string = '';
  serviceCenterInfo: any = null;
  bookingId: string = '';
  mode: 'create' | 'view' = 'create';
  loading: boolean = false;
  error: string = '';

  // Invoice Data
  bookedServices: any[] = [];
  packageServices: any[] = [];
  additionalServices: any[] = [];
  serviceOffers: any[] = [];
  newAdditionalService: any = null;
  selectedServiceForParts: any = null;
  allServices: any[] = [];

  labourWarrantyDays: number = 30;
  partsWarrantyDays: number = 90;
  labourWarrantyNotes: string = 'Covers workmanship and installation';
  partsWarrantyNotes: string = 'Original manufacturer parts only';
  generalWarrantyTerms: string = 'Defective parts must be returned in original condition\nWarranty covers manufacturing defects only';
  warrantyExclusions: string = 'Warranty void if vehicle is serviced elsewhere\nDoes not cover wear and tear or accidental damage';

  // Mileage Tracking
  beforeServiceMileage: number = 0;
  afterServiceMileage: number = 0;
  mileageError: string | null = null;

  serviceMaintenances: any[] = [
    {
      serviceType: 'engine_oil',
      lastServiceMileage: 0,
      nextServiceMileage: 0,
      nextServiceDate: '',
      updated: false
    },
    {
      serviceType: 'alignment',
      lastServiceMileage: 0,
      nextServiceMileage: 0,
      nextServiceDate: '',
      updated: false
    },
    {
      serviceType: 'battery',
      lastServiceMileage: 0,
      nextServiceMileage: 0,
      nextServiceDate: '',
      updated: false
    },
    {
      serviceType: 'tire_rotation',
      lastServiceMileage: 0,
      nextServiceMileage: 0,
      nextServiceDate: '',
      updated: false
    },
    {
      serviceType: 'brake_fluid',
      lastServiceMileage: 0,
      nextServiceMileage: 0,
      nextServiceDate: '',
      updated: false
    },
    {
      serviceType: 'air_filter',
      lastServiceMileage: 0,
      nextServiceMileage: 0,
      nextServiceDate: '',
      updated: false
    },
    {
      serviceType: 'coolant',
      lastServiceMileage: 0,
      nextServiceMileage: 0,
      nextServiceDate: '',
      updated: false
    },
    {
      serviceType: 'gear_oil',
      lastServiceMileage: 0,
      nextServiceMileage: 0,
      nextServiceDate: '',
      updated: false
    },
    {
      serviceType: 'at_fluid',
      lastServiceMileage: 0,
      nextServiceMileage: 0,
      nextServiceDate: '',
      updated: false
    },
  ];

  standaloneParts: any[] = [];
  newPartName: string = '';
  newPartQuantity: number = 1;
  newPartUnitPrice: number = 0;

  // Tax Configuration
  enableTax: boolean = true;
  taxRate: number = 0.08;

  constructor(private route: ActivatedRoute) { }

  async ngOnInit() {
    await this.initializeComponent();
  }

  private async initializeComponent() {
    try {
      this.adminName = this.route.snapshot.paramMap.get('adminName') || '';
      this.bookingId = this.route.snapshot.paramMap.get('bookingId') || '';
      this.invoiceId = this.route.snapshot.paramMap.get('invoiceId') || '';

      if (this.invoiceId) {
        this.mode = 'view';
        await this.loadInvoice(this.invoiceId);
        await this.loadServiceCenterInfo(this.booking.serviceCenterId);
      } else if (this.bookingId) {
        await this.loadBooking();

        if (this.booking.invoiceId) {
          this.mode = 'view';
          await this.loadServiceCenterInfo(this.booking.serviceCenterId);
          await this.loadInvoice(this.booking.invoiceId);
        } else if (this.booking.status === 'in_progress') {
          this.mode = 'create';
          await this.loadServiceCenterInfo(this.booking.serviceCenterId);
          await this.loadServiceOffers();
        } else {
          this.error = 'Cannot generate invoice. Booking must be in "In Progress" status.';
          this.loading = false;
        }
      } else {
        this.error = 'No booking ID or invoice ID provided';
        this.loading = false;
      }
    } catch (error) {
      console.error('Error initializing component:', error);
      this.error = 'Failed to initialize component';
      this.loading = false;
    }
  }

  async loadBooking() {
    try {
      const bookingRef = doc(this.firestore, 'service_bookings', this.bookingId);
      const bookingSnap = await getDoc(bookingRef);

      if (bookingSnap.exists()) {
        this.booking = { id: bookingSnap.id, ...bookingSnap.data() };
        await this.enrichBookingData();

        if (this.mode === 'create') {
          this.initializeInvoiceData();
        }
      }
    } catch (error) {
      console.error('Error loading booking:', error);
      alert('Failed to load booking details');
    }
  }

  canGenerateInvoice(): boolean {
    return this.mode === 'create' &&
      this.booking &&
      !this.booking.invoiceId &&
      this.booking.status === 'in_progress';
  }

  async loadInvoice(invoiceId: string) {
    this.loading = true;
    try {
      const invoiceRef = doc(this.firestore, 'service_invoice', invoiceId);
      const invoiceSnap = await getDoc(invoiceRef);

      if (invoiceSnap.exists()) {
        this.invoice = { id: invoiceSnap.id, ...invoiceSnap.data() };

        if (this.invoice.serviceBookingId) {
          await this.loadBookingForInvoice(this.invoice.serviceBookingId);
        }
      } else {
        this.error = 'Invoice not found';
      }
    } catch (error) {
      console.error('Error loading invoice:', error);
      this.error = 'Failed to load invoice';
    }
    this.loading = false;
  }

  private async loadBookingForInvoice(bookingId: string) {
    try {
      const bookingRef = doc(this.firestore, 'service_bookings', bookingId);
      const bookingSnap = await getDoc(bookingRef);

      if (bookingSnap.exists()) {
        this.booking = { id: bookingSnap.id, ...bookingSnap.data() };
        await this.enrichBookingData();
      }
    } catch (error) {
      console.error('Error loading booking for invoice:', error);
    }
  }

  async enrichBookingData() {
    if (this.booking.userId) {
      const userRef = doc(this.firestore, 'car_owners', this.booking.userId);
      const uSnap = await getDoc(userRef);
      if (uSnap.exists()) {
        const userData = uSnap.data();
        this.booking.customer = {
          id: this.booking.userId,
          name: userData['name'],
          email: userData['email'],
          phone: userData['phone']
        };
      }
    }
  }

  getMileageUpdatedAt(): string {
    if (this.booking) {
      if (!this.booking?.vehicle?.mileageUpdatedAt) {
        return 'N/A';
      }
      else {
        try {
          const timestamp = this.booking.vehicle.mileageUpdatedAt;
          const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);

          return this.formatDateTime(date);
        } catch (error) {
          console.error('Error formatting mileage updated date:', error);
          return 'N/A';
        }
      }
    } else if (this.invoice) {
      if (!this.invoice?.mileage?.updatedAt) {
        return 'N/A';
      } else {
        try {
          const timestamp = this.booking.vehicle.mileageUpdatedAt;
          const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);

          return this.formatDateTime(date);
        } catch (error) {
          console.error('Error formatting mileage updated date:', error);
          return 'N/A';
        }
      }
    } else {
      return 'N/A';
    }


  }

  formatDateTime(date: Date): string {
    return date.toLocaleDateString('en-MY', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  initializeInvoiceData() {
    // Initialize booked services
    this.bookedServices = (this.booking.services || []).map((service: any) => {
    const parts = service.parts || [];
    const processedParts = parts.map((part: any) => {
      let unitPrice = part.unitPrice || 0;
      let totalPrice = part.totalPrice || 0;

      // Handle the part pricing structure for individual parts
      if (part.partPrice !== undefined && part.partPrice !== null) {
        unitPrice = part.partPrice;
        totalPrice = unitPrice * (part.quantity || 1);
      } else if (part.partPriceMin !== undefined && part.partPriceMin !== null) {
        unitPrice = part.partPriceMin;
        totalPrice = unitPrice * (part.quantity || 1);
      } else if (part.partPriceMin !== undefined && part.partPriceMax !== undefined) {
        unitPrice = (part.partPriceMin + part.partPriceMax) / 2;
        totalPrice = unitPrice * (part.quantity || 1);
      } else {
        totalPrice = (part.quantity || 1) * (part.unitPrice || part.price || 0);
      }

        return {
          name: part.name || part.partName || '',
          quantity: part.quantity || 1,
          unitPrice: unitPrice,
          totalPrice: totalPrice,
          // Preserve the original pricing structure
          partPrice: part.partPrice,
          partPriceMin: part.partPriceMin,
          partPriceMax: part.partPriceMax,
          serviceId: part.serviceId,
          serviceName: part.serviceName
        };
      });

      const hasServiceLevelPricing = service.partPrice !== undefined || 
                                  service.partPriceMin !== undefined || 
                                  service.partPriceMax !== undefined;
    
    if (hasServiceLevelPricing) {
      let unitPrice = service.partPrice || 0;
      let partName = `${service.serviceName} Parts`;

      if ((unitPrice === 0 || unitPrice === undefined || unitPrice === null) && 
          service.partPriceMin !== undefined) {
        unitPrice = service.partPriceMin;
      }

      // Only create the service level part if it doesn't already exist
      const existingServiceLevelPart = processedParts.find((part: any) => part.isServiceLevelPart);
      
      if (!existingServiceLevelPart && (unitPrice > 0 || service.partPriceMin > 0)) {
        processedParts.push({
          name: partName,
          quantity: 1,
          unitPrice: unitPrice,
          totalPrice: unitPrice,
          partPrice: service.partPrice,
          partPriceMin: service.partPriceMin,
          partPriceMax: service.partPriceMax,
          serviceId: service.serviceId,
          serviceName: service.serviceName,
          isServiceLevelPart: true,
        });
      }
    }

      const labourPrice = service.labourPrice || service.labourPriceMin || 0;
      const partsTotal = processedParts.reduce((total: number, part: any) => total + (part.totalPrice || 0), 0);

      return {
        ...service,
        labourPrice: labourPrice,
        parts: processedParts,
        totalPrice: labourPrice + partsTotal
      };
    });

    // Initialize package services
    this.packageServices = (this.booking.packages || []).map((pkg: any) => ({
      ...pkg,
      fixedPrice: pkg.fixedPrice || pkg.price || 0,
      totalPrice: pkg.fixedPrice || pkg.price || 0
    }));

    // Combine all services for parts selection
    this.allServices = [...this.bookedServices, ...this.packageServices, ...this.additionalServices];

    // Initialize mileage
    this.beforeServiceMileage = this.booking.vehicle?.lastServiceMileage || 0;
    this.afterServiceMileage = this.booking.vehicle?.lastServiceMileage || 0;

    // Initialize service maintenance
    this.initializeServiceMaintenance();
  }

  initializeServiceMaintenance() {
    const vehicleMaintenance = this.booking.vehicle?.serviceMaintenances || [];

    this.serviceMaintenances = this.serviceMaintenances.map(maintenance => {
      const existing = vehicleMaintenance.find((m: any) => m.serviceType === maintenance.serviceType);

      if (existing) {
        return {
          ...maintenance,
          lastServiceMileage: existing.lastServiceMileage || 0,
          nextServiceMileage: existing.nextServiceMileage || this.calculateNextMileage(this.beforeServiceMileage),
          nextServiceDate: existing.nextServiceDate,
          updated: false
        };
      } else {
        return {
          ...maintenance,
          lastServiceMileage: this.beforeServiceMileage,
          nextServiceMileage: this.calculateNextMileage(this.beforeServiceMileage),
          nextServiceDate: this.calculateNextServiceDate(6),
          updated: false
        };
      }
    });
  }

  async loadServiceOffers() {
    try {
      const offersSnap = await getDocs(query(
        collection(this.firestore, 'services'),
      ));
      this.serviceOffers = offersSnap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        quantity: 1,
        unitPrice: d.data()['price'] || 0
      }));
    } catch (err) {
      console.error('Failed loading service offers', err);
    }
  }

  async loadServiceCenterInfo(scId: string) {
    try {
      const scSnap = await getDoc(doc(this.firestore, 'service_centers', scId));

      if (scSnap.exists()) {
        this.serviceCenterInfo = {
          id: scSnap.id,
          ...scSnap.data()
        };
      }
    } catch (err) {
      console.error('Failed loading service center info', err);
    }
  }

  calculatePartsRowNumber(serviceIndex: number, partIndex: number): number {
  let rowNumber = 0;
  
  // Count parts from previous services
  for (let i = 0; i < serviceIndex; i++) {
    const service = this.bookedServices[i];
    rowNumber += service.parts ? service.parts.length : 0;
  }
  
  // Add current part index
  return rowNumber + partIndex + 1;
}

// Calculate row number for package services parts
calculatePackagePartsRowNumber(packageIndex: number): number {
  const bookedPartsCount = this.getTotalBookedServicesParts();
  return bookedPartsCount + packageIndex + 1;
}

// Calculate row number for additional services parts
calculateAdditionalPartsRowNumber(serviceIndex: number, partIndex: number): number {
  const bookedPartsCount = this.getTotalBookedServicesParts();
  const packagePartsCount = this.packageServices.length;
  
  let rowNumber = bookedPartsCount + packagePartsCount;
  
  // Count parts from previous additional services
  for (let i = 0; i < serviceIndex; i++) {
    const service = this.additionalServices[i];
    rowNumber += service.parts ? service.parts.length : 0;
  }
  
  // Add current part index
  return rowNumber + partIndex + 1;
}

// Calculate row number for standalone parts
calculateStandalonePartsRowNumber(partIndex: number): number {
  const bookedPartsCount = this.getTotalBookedServicesParts();
  const packagePartsCount = this.packageServices.length;
  const additionalPartsCount = this.additionalServices.reduce((total, service) => {
    return total + (service.parts ? service.parts.length : 0);
  }, 0);
  
  return bookedPartsCount + packagePartsCount + additionalPartsCount + partIndex + 1;
}

getTotalBookedServicesParts(): number {
  return this.bookedServices.reduce((total, service) => {
    return total + (service.parts ? service.parts.length : 0);
  }, 0);
}

  validateMileage() {
    if (this.afterServiceMileage !== null && this.afterServiceMileage < this.beforeServiceMileage) {
      this.mileageError = `Mileage cannot be less than ${this.beforeServiceMileage} km`;
    } else {
      this.mileageError = null;
    }
  }

  async getServiceCenterName(): Promise<string> {
    if (!this.booking?.serviceCenterId) return 'N/A';

    const scRef = doc(this.firestore, 'service_centers', this.booking.serviceCenterId);
    const scSnap = await getDoc(scRef);

    if (scSnap.exists()) {
      const data: any = scSnap.data();
      return data.serviceCenterInfo?.name || 'N/A';
    }
    return 'N/A';
  }

  getPackageServiceNames(services: any[]): string {
    if (!services || !Array.isArray(services)) return '';
    return services.map(s => s.serviceName || s.name || '').filter(name => name).join(', ');
  }

  async generateInvoice() {
    if (!this.booking) return;

    // Double-check that no invoice exists
    if (this.booking.invoiceId) {
      alert('An invoice already exists for this booking. Cannot generate a new one.');
      this.router.navigate(['/manage-service-bookings']);
      return;
    }

    // Ensure booking is in correct status
    if (this.booking.status !== 'in_progress') {
      alert('Cannot generate invoice. Booking must be in "In Progress" status.');
      return;
    }

    if (!this.booking.serviceCenterId) {
      alert('Service center information is missing. Cannot generate invoice.');
      return;
    }

    this.serviceCenterName = await this.getServiceCenterName();

    try {
      const invoiceRef = doc(collection(this.firestore, 'service_invoice'));
      const invoiceId = invoiceRef.id;

      const updatedMaintenances = this.serviceMaintenances
        .filter(m => m.updated)
        .map(m => ({
          serviceType: m.serviceType,
          lastServiceMileage: this.afterServiceMileage,
          mileageUpdatedAt: Timestamp.now(),
          updatedBy: this.adminName || 'N/A',
          updatedFrom: this.serviceCenterName || 'serviceCenter',
          nextServiceMileage: m.nextServiceMileage,
          nextServiceDate: m.nextServiceDate
        }));

      const processedBookedServices = this.processBookedServicesForInvoice();
      const processedPackageServices = this.processPackageServicesForInvoice();
      const processedAdditionalServices = this.processAdditionalServicesForInvoice();
      const processedStandaloneParts = this.processStandalonePartsForInvoice();

      // Calculate labour and parts subtotals
      const labourSubtotal = this.calculateLabourSubtotal();
      const partsSubtotal = this.calculatePartsSubtotal();
      const subtotal = labourSubtotal + partsSubtotal;
      const taxAmount = this.enableTax ? subtotal * this.taxRate : 0;
      const totalAmount = subtotal + taxAmount;

      const invoice = {
        invoiceId: invoiceId,
        serviceBookingId: this.booking.id,
        serviceCenterId: this.booking.serviceCenterId,
        userId: this.booking.userId,
        vehicleId: this.booking.vehicleId,

        customerInfo: {
          name: this.booking.customer?.['name'],
          email: this.booking.customer?.['email'],
          phone: this.booking.customer?.['phone'],
        },
        vehicleInfo: {
          make: this.booking.vehicle?.['make'],
          model: this.booking.vehicle?.['model'],
          year: this.booking.vehicle?.['year'],
          plateNumber: this.booking.vehicle?.['plateNumber'],
          vin: this.booking.vehicle?.['vin']
        },

        bookedServices: processedBookedServices,
        packageServices: processedPackageServices,
        additionalServices: processedAdditionalServices,
        standaloneParts: processedStandaloneParts,

        labourSubtotal: labourSubtotal,
        partsSubtotal: partsSubtotal,
        subtotal: subtotal,
        taxAmount: taxAmount,
        totalAmount: totalAmount,

        mileage: {
          beforeService: this.beforeServiceMileage,
          afterService: this.afterServiceMileage,
          updatedAt: Timestamp.now(),
          updatedBy: this.adminName || 'serviceCenterAdmin',
          updatedFrom: this.serviceCenterName || 'serviceCenter',
        },

        serviceMaintenances: updatedMaintenances,

        // Warranty Information
        warranty: {
          labour: {
            days: this.labourWarrantyDays,
            notes: this.labourWarrantyNotes,
            startDate: Timestamp.now(),
            endDate: this.calculateWarrantyEndDate(this.labourWarrantyDays) ?
              Timestamp.fromDate(this.calculateWarrantyEndDate(this.labourWarrantyDays)!) : null
          },
          parts: {
            days: this.partsWarrantyDays,
            notes: this.partsWarrantyNotes,
            startDate: Timestamp.now(),
            endDate: this.calculateWarrantyEndDate(this.partsWarrantyDays) ?
              Timestamp.fromDate(this.calculateWarrantyEndDate(this.partsWarrantyDays)!) : null
          },
          generalTerms: this.generalWarrantyTerms,
          exclusions: this.warrantyExclusions,
          issuedAt: Timestamp.now()
        },

        payment: {
          method: 'N/A',
          status: 'unpaid',
          total: totalAmount,
          paidAt: null
        },

        createdAt: Timestamp.now(),
        createdBy: this.serviceCenterName + " - " + this.adminName || 'system',
        status: 'generated',
        type: 'invoice'
      };

      await setDoc(invoiceRef, invoice);

      const bookingUpdate: any = {
        invoiceId: invoiceId,
        status: 'invoice_generated',
        updatedAt: Timestamp.now(),
        statusUpdatedBy: this.adminName || 'N/A'
      };

      const newStatusHistory = {
        status: 'invoice_generated',
        timestamp: Timestamp.now(),
        updatedBy: this.adminName || 'system',
        notes: 'Invoice generated. Please proceed to make payment before collecting your vehicle.'
      };

      bookingUpdate.statusHistory = [...(this.booking.statusHistory || []), newStatusHistory];

      bookingUpdate.timestamps = {
        ...this.booking.timestamps,
        invoiceGeneratedAt: Timestamp.now()
      };

      await updateDoc(doc(this.firestore, 'service_bookings', this.booking.id), bookingUpdate);

      // Update vehicle information
      if (this.afterServiceMileage > 0 && updatedMaintenances.length > 0) {
        await this.updateVehicleInCarOwner(
          this.booking.userId,
          this.booking.vehicleId,
          this.afterServiceMileage,
          this.adminName,
          updatedMaintenances
        );
      }

      alert('Invoice generated successfully!');
      window.location.reload();
    } catch (error) {
      console.error('Error generating invoice:', error);
      alert('Failed to generate invoice. Please try again.');
    }
  }

  private processBookedServicesForInvoice(): any[] {
    return this.bookedServices.map(service => {
      const labourAmount = service.labourPrice || 0;
      const partsTotal = this.calculateServicePartsTotal(service);

      return {
        serviceId: service.serviceId || '',
        serviceName: service.serviceName || '',
        serviceType: service.serviceType || '',

        labour: {
          description: `${service.serviceName}`,
          quantity: 1,
          unitPrice: labourAmount,
          amount: labourAmount
        },

        parts: (service.parts || []).map((part: any) => ({
          partId: part.partId || '',
          name: part.name || '',
          description: part.name || '',
          quantity: part.quantity || 1,
          unitPrice: part.unitPrice || 0,
          amount: part.totalPrice || 0
        })),

        labourPrice: labourAmount,
        partsTotal: partsTotal,
        totalPrice: labourAmount + partsTotal
      };
    });
  }

  private processPackageServicesForInvoice(): any[] {
    return this.packageServices.map(pkg => {
      const labourAmount = pkg.labourPrice || 0;
      const partsAmount = this.getPackagePartPrice(pkg);

      return {
        packageId: pkg.packageId || '',
        packageName: pkg.packageName || pkg.name || '',
        services: pkg.services || '',

        labour: {
          description: `${pkg.packageName || pkg.name}`,
          quantity: 1,
          unitPrice: labourAmount,
          amount: labourAmount
        },

        parts: {
          description: `${pkg.packageName || pkg.name}`,
          quantity: 1,
          unitPrice: partsAmount,
          amount: partsAmount
        },

        labourPrice: labourAmount,
        partPrice: partsAmount,
        totalPrice: labourAmount + partsAmount,

        fixedPrice: pkg.fixedPrice || 0
      };
    });
  }

  private processAdditionalServicesForInvoice(): any[] {
    return this.additionalServices.map(service => {
      const serviceQuantity = service.quantity || 1;
      const serviceUnitPrice = service.unitPrice || service.price || 0;
      const serviceAmount = serviceQuantity * serviceUnitPrice;
      const partsTotal = this.calculateAdditionalServicePartsTotal(service);

      return {
        // Service information
        serviceId: service.id || '',
        serviceName: service.name || service.serviceName || '',

        // Service labour information
        serviceLabour: {
          description: service.name || service.serviceName || '',
          quantity: serviceQuantity,
          unitPrice: serviceUnitPrice,
          amount: serviceAmount
        },

        // Parts information
        parts: (service.parts || []).map((part: any) => ({
          name: part.name || '',
          description: part.name || '',
          quantity: part.quantity || 1,
          unitPrice: part.unitPrice || 0,
          amount: part.totalPrice || 0
        })),

        // Totals
        quantity: serviceQuantity,
        unitPrice: serviceUnitPrice,
        labourPrice: serviceAmount,
        partsTotal: partsTotal,
        totalPrice: serviceAmount + partsTotal
      };
    });
  }

  private processStandalonePartsForInvoice(): any[] {
    return this.standaloneParts.map(part => ({
      partId: part.partId || '',
      name: part.name || '',
      description: part.name || '',
      quantity: part.quantity || 1,
      unitPrice: part.unitPrice || 0,
      amount: part.totalPrice || 0,
      type: 'standalone'
    }));
  }

  async updateVehicleInCarOwner(userId: string, vehicleId: string, currentMileage: number, updatedBy: string | null, updatedMaintenances: any[]) {
    try {
      const carOwnerRef = doc(this.firestore, 'car_owners', userId);
      const carOwnerSnap = await getDoc(carOwnerRef);

      if (!carOwnerSnap.exists()) {
        console.warn('Car owner document not found:', userId);
        return;
      }

      const carOwnerData = carOwnerSnap.data();
      const vehicles = carOwnerData['vehicles'] || [];

      const vehicleIndex = vehicles.findIndex((v: any) => v['plateNumber'] === vehicleId);

      if (vehicleIndex === -1) {
        console.warn('Vehicle not found in car_owner vehicles array:', vehicleId);
        return;
      }

      const existingServiceMaintenances = Array.isArray(vehicles[vehicleIndex]['serviceMaintenances'])
        ? [...vehicles[vehicleIndex]['serviceMaintenances']]
        : [];

      const mergedServiceMaintenances = this.mergeServiceMaintenances(
        existingServiceMaintenances,
        updatedMaintenances
      );

      const updatedVehicle = {
        ...vehicles[vehicleIndex],
        lastServiceDate: Timestamp.now(),
        mileageUpdatedBy: updatedBy || null,
        lastServiceMileage: currentMileage,
        mileageUpdatedAt: Timestamp.now(),
        serviceMaintenances: mergedServiceMaintenances
      };

      const updatedVehicles = [...vehicles];
      updatedVehicles[vehicleIndex] = updatedVehicle;

      await updateDoc(carOwnerRef, {
        vehicles: updatedVehicles
      });

      console.log('Vehicle updated successfully in car_owner document');
    } catch (error) {
      console.error('Error updating vehicle in car_owner:', error);
      throw error;
    }
  }

  private mergeServiceMaintenances(existing: any[], updated: any[]): any[] {
    const result = [...existing];

    updated.forEach(updatedItem => {
      const existingIndex = result.findIndex(item => item['serviceType'] === updatedItem['serviceType']);

      if (existingIndex !== -1) {
        result[existingIndex] = {
          ...result[existingIndex],
          lastServiceMileage: updatedItem['lastServiceMileage'],
          mileageUpdatedAt: updatedItem['mileageUpdatedAt'],
          updatedBy: updatedItem['updatedBy'],
          nextServiceMileage: updatedItem['nextServiceMileage'],
          nextServiceDate: updatedItem['nextServiceDate']
        };
      } else {
        result.push(updatedItem);
      }
    });

    return result;
  }

  generateInvoiceNumber(): string {
    const timestamp = new Date().getTime();
    const random = Math.floor(Math.random() * 1000);
    return `INV-${timestamp}-${random}`;
  }

  getCurrentDate(): string {
    return new Date().toLocaleDateString('en-MY', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  hasParts(): boolean {
    const hasBookedServiceParts = this.bookedServices.some(service =>
      service.parts && service.parts.length > 0
    );
    const hasAdditionalServiceParts = this.additionalServices.some(service =>
      service.parts && service.parts.length > 0
    );
    const hasStandaloneParts = this.standaloneParts.length > 0;

    return hasBookedServiceParts || hasAdditionalServiceParts || hasStandaloneParts;
  }

  hasPartsInInvoice(): boolean {
    if (!this.invoice) return false;

    const hasBookedServiceParts = this.invoice.bookedServices?.some((service: any) =>
      service.parts && service.parts.length > 0
    );
    const hasAdditionalServiceParts = this.invoice.additionalServices?.some((service: any) =>
      service.parts && service.parts.length > 0
    );
    const hasStandaloneParts = this.invoice.standaloneParts && this.invoice.standaloneParts.length > 0;

    return hasBookedServiceParts || hasAdditionalServiceParts || hasStandaloneParts;
  }

  getLabourItems(): any[] {
    if (!this.invoice) return [];

    const labourItems: any[] = [];

    // Booked services labour
    if (this.invoice.bookedServices) {
      this.invoice.bookedServices.forEach((service: any) => {
        if (service.labour && service.labour.amount > 0) {
          labourItems.push(service.labour);
        }
      });
    }

    // Package services labour
    if (this.invoice.packageServices) {
      this.invoice.packageServices.forEach((pkg: any) => {
        if (pkg.labour && pkg.labour.amount > 0) {
          labourItems.push(pkg.labour);
        }
      });
    }

    // Additional services labour
    if (this.invoice.additionalServices) {
      this.invoice.additionalServices.forEach((service: any) => {
        if (service.serviceLabour && service.serviceLabour.amount > 0) {
          labourItems.push(service.serviceLabour);
        }
      });
    }
    return labourItems;
  }

  getPartPricePlaceholder(part: any): string {
    if (part.partPrice) {
      return part.partPrice.toString();
    } else if (part.partPriceMin) {
      return part.partPriceMin.toString();
    }
    return '0';
  }

  getPartsItems(): any[] {
    if (!this.invoice) return [];

    const partsItems: any[] = [];

    // Parts from booked services
    if (this.invoice.bookedServices) {
      this.invoice.bookedServices.forEach((service: any) => {
        if (service.parts && Array.isArray(service.parts)) {
          partsItems.push(...service.parts);
        }
      });
    }

    // Parts from package services
    if (this.invoice.packageServices) {
      this.invoice.packageServices.forEach((pkg: any) => {
        if (pkg.parts && pkg.parts.amount > 0) {
          partsItems.push(pkg.parts);
        }
      });
    }

    // Parts from additional services
    if (this.invoice.additionalServices) {
      this.invoice.additionalServices.forEach((service: any) => {
        if (service.parts && Array.isArray(service.parts)) {
          partsItems.push(...service.parts);
        }
      });
    }

    // Standalone parts
    if (this.invoice.standaloneParts) {
      partsItems.push(...this.invoice.standaloneParts);
    }

    return partsItems;
  }

  getPackagePartPrice(pkg: any): number {
    return pkg.partPrice || pkg.partPriceMin || 0;
  }

  calculateLabourSubtotal(): number {
    let total = 0;

    // Booked services labour
    total += this.bookedServices.reduce((sum, service) => sum + (service.labourPrice || 0), 0);

    // Package services
    total += this.packageServices.reduce((sum, pkg) => sum + (pkg.labourPrice || 0), 0);

    // Additional services
    total += this.additionalServices.reduce((sum, service) => {
      const servicePrice = service.unitPrice || service.price || 0;
      return sum + (servicePrice * (service.quantity || 1));
    }, 0);

    return total;
  }

  calculatePartsSubtotal(): number {
    let total = 0;

    // Parts from booked services
    total += this.bookedServices.reduce((sum, service) => {
      return sum + this.calculateServicePartsTotal(service);
    }, 0);

    total += this.packageServices.reduce((sum, pkg) => {
      return sum + this.getPackagePartPrice(pkg);
    }, 0);

    // Parts from additional services
    total += this.additionalServices.reduce((sum, service) => {
      return sum + this.calculateAdditionalServicePartsTotal(service);
    }, 0);

    // Standalone parts
    total += this.calculateStandalonePartsTotal();

    return total;
  }

  addPartToSelectedService() {
    if (this.selectedServiceForParts) {
      this.addPartToService(this.selectedServiceForParts);
      this.selectedServiceForParts = null;
    }
  }

  onTaxToggleChange() {
    // Recalculate totals when tax is toggled
  }

  addStandalonePart() {
    if (!this.newPartName || !this.newPartQuantity || !this.newPartUnitPrice) {
      return;
    }

    const newPart = {
      name: this.newPartName,
      quantity: this.newPartQuantity,
      unitPrice: this.newPartUnitPrice,
      totalPrice: this.newPartQuantity * this.newPartUnitPrice,
      type: 'standalone'
    };

    this.standaloneParts.push(newPart);

    this.newPartName = '';
    this.newPartQuantity = 1;
    this.newPartUnitPrice = 0;
  }

  removeStandalonePart(index: number) {
    this.standaloneParts.splice(index, 1);
  }

  updateStandalonePartTotal(part: any) {
    part.totalPrice = (part.quantity || 1) * (part.unitPrice || 0);
  }

  calculateStandalonePartsTotal(): number {
    return this.standaloneParts.reduce((total: number, part: any) => {
      return total + (part.totalPrice || 0);
    }, 0);
  }

  getMaintenanceDisplayName(serviceType: string): string {
    const displayNames: { [key: string]: string } = {
      'engine_oil': 'Engine Oil Change',
      'alignment': 'Wheel Alignment',
      'battery': 'Battery Replacement',
      'tire_rotation': 'Tire Rotation',
      'brake_fluid': 'Brake Fluid Change',
      'air_filter': 'Air Filter Replacement',
      'coolant': 'Coolant Replacement'
    };
    return displayNames[serviceType] || serviceType.replace('_', ' ');
  }

  updatePackageTotal(pkg: any) {
    const partPrice = this.getPackagePartPrice(pkg);
    pkg.totalPrice = (pkg.labourPrice || 0) + partPrice;
  }

  addPartToService(service: any) {
    if (!service.parts) {
      service.parts = [];
    }
    service.parts.push({
      name: '',
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0,
      partPrice: service.partPrice,
      partPriceMin: service.partPriceMin,
      partPriceMax: service.partPriceMax
    });
    this.updateServiceTotal(service);
  }

  removePartFromService(service: any, partIndex: number) {
    if (service.parts && service.parts.length > partIndex) {
      service.parts.splice(partIndex, 1);
      this.updateServiceTotal(service);
    }
  }

  updatePartTotal(part: any) {
    if (!part.quantity || part.quantity < 1) {
      part.quantity = 1;
    }
    if (!part.unitPrice || part.unitPrice < 0) {
      part.unitPrice = 0;
    }
    part.totalPrice = part.quantity * part.unitPrice;
  }

  updateServiceTotal(service: any) {
    const partsTotal = this.calculateServicePartsTotal(service);
    service.totalPrice = (service.labourPrice || 0) + partsTotal;
  }

  addPartToAdditionalService(service: any) {
    if (!service.parts) {
      service.parts = [];
    }
    service.parts.push({
      name: '',
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0
    });
  }

  removePartFromAdditionalService(service: any, partIndex: number) {
    service.parts.splice(partIndex, 1);
  }

  updateAdditionalServicePartTotal(part: any) {
    part.totalPrice = part.quantity * part.unitPrice;
  }

  removeBookedService(index: number) {
    this.bookedServices.splice(index, 1);
  }

  removePackageService(index: number) {
    this.packageServices.splice(index, 1);
  }

  addAdditionalService() {
    if (this.newAdditionalService) {
      const additionalService = {
        ...this.newAdditionalService,
        quantity: 1,
        unitPrice: this.newAdditionalService.price || 0,
        totalPrice: this.newAdditionalService.price || 0
      };
      this.additionalServices.push(additionalService);
      this.newAdditionalService = null;
      this.allServices = [...this.bookedServices, ...this.packageServices, ...this.additionalServices];
    }
  }

  updateAdditionalServiceTotal(service: any) {
    service.totalPrice = (service.quantity || 0) * (service.unitPrice || 0);
  }

  removeAdditionalService(index: number) {
    this.additionalServices.splice(index, 1);
    this.allServices = [...this.bookedServices, ...this.packageServices, ...this.additionalServices];
  }

  setStandardWarranty() {
    this.labourWarrantyDays = 30;
    this.partsWarrantyDays = 90;
    this.labourWarrantyNotes = 'Covers workmanship and installation';
    this.partsWarrantyNotes = 'Original manufacturer parts only';
    this.generalWarrantyTerms = 'Defective parts must be returned in original condition\nWarranty covers manufacturing defects only';
    this.warrantyExclusions = 'Warranty void if vehicle is serviced elsewhere\nDoes not cover wear and tear or accidental damage';
  }

  setExtendedWarranty() {
    this.labourWarrantyDays = 60;
    this.partsWarrantyDays = 180;
    this.labourWarrantyNotes = 'Extended coverage for workmanship and installation';
    this.partsWarrantyNotes = 'Genuine parts with extended manufacturer warranty';
    this.generalWarrantyTerms = 'Defective parts must be returned in original condition\nFree replacement for manufacturing defects\nIncludes labor for warranty repairs';
    this.warrantyExclusions = 'Warranty void if vehicle is serviced elsewhere\nDoes not cover wear and tear, accidental damage, or improper use';
  }

  setNoWarranty() {
    this.labourWarrantyDays = 0;
    this.partsWarrantyDays = 0;
    this.labourWarrantyNotes = '';
    this.partsWarrantyNotes = '';
    this.generalWarrantyTerms = 'No warranty provided. All services and parts are provided on an "as-is" basis.';
    this.warrantyExclusions = '';
  }

  showWarrantyPreview(): boolean {
    return this.labourWarrantyDays > 0 || this.partsWarrantyDays > 0 ||
      !!this.generalWarrantyTerms || !!this.warrantyExclusions;
  }

  calculateWarrantyEndDate(warrantyDays: number): Date | null {
    if (!warrantyDays || warrantyDays <= 0) return null;

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + warrantyDays);
    return endDate;
  }

  formatWarrantyText(text: string): string {
    if (!text) return '';
    return text.replace(/\n/g, '<br>');
  }

  formatWarrantyEndDate(warrantyDays: number): string {
    const endDate = this.calculateWarrantyEndDate(warrantyDays);
    if (!endDate) return 'No warranty';

    return endDate.toLocaleDateString('en-MY', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  calculateServiceTotal(service: any): number {
    const labourPrice = service.labourPrice || 0;
    const partsTotal = (service.parts || []).reduce((total: number, part: any) =>
      total + (part.totalPrice || 0), 0);
    return labourPrice + partsTotal;
  }

  calculateNextMileage(currentMileage: number): number {
    return currentMileage + 5000;
  }

  calculateNextServiceDate(months: number = 6): string {
    const nextDate = new Date();
    nextDate.setMonth(nextDate.getMonth() + months);
    return nextDate.toISOString().split('T')[0];
  }

  calculateSubtotal(): number {
    return this.calculateLabourSubtotal() + this.calculatePartsSubtotal();
  }

  calculateTaxAmount(): number {
    if (!this.enableTax) return 0;
    return this.calculateSubtotal() * this.taxRate;
  }

  calculateTotal(): number {
    return this.calculateSubtotal() + this.calculateTaxAmount();
  }

  calculateServicePartsTotal(service: any): number {
    if (!service.parts || service.parts.length === 0) return 0;

    return service.parts.reduce((total: number, part: any) => {
      const partTotal = (part.quantity || 1) * (part.unitPrice || 0);
      part.totalPrice = partTotal;
      return total + partTotal;
    }, 0);
  }

  calculateAdditionalServicePartsTotal(service: any): number {
    if (!service.parts || service.parts.length === 0) return 0;
    return service.parts.reduce((total: number, part: any) => {
      const partTotal = (part.quantity || 1) * (part.unitPrice || 0);
      part.totalPrice = partTotal;
      return total + partTotal;
    }, 0);
  }

  calculateAdditionalServiceTotal(service: any): number {
    const partsTotal = this.calculateAdditionalServicePartsTotal(service);
    const servicePrice = (service.price || service.unitPrice || 0) * (service.quantity || 1);
    return servicePrice + partsTotal;
  }

  getPaymentStatusClass(status: string): string {
    const classes: { [key: string]: string } = {
      'pending': 'badge bg-warning',
      'paid': 'badge bg-success',
      'generated': 'badge bg-info'
    };
    return classes[status] || 'badge bg-secondary';
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';
    const jsDate = date.toDate ? date.toDate() : new Date(date);
    return jsDate.toLocaleDateString('en-MY', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  formatCurrency(amount: number): string {
    if (!amount) return 'RM0.00';
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: 'MYR'
    }).format(amount);
  }

  shareInvoice(): void {
    alert('Share functionality to be implemented');
  }

  downloadInvoice(): void {
    alert('Download PDF functionality to be implemented');
  }

  printInvoice(): void {
    window.print();
  }

  goBack() {
    this.router.navigate(['/manage-service-bookings']);
  }
}