import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Firestore, doc, getDoc, collection, setDoc, updateDoc, Timestamp, query, where, getDocs } from '@angular/fire/firestore';
import { ReactiveFormsModule, FormBuilder, FormsModule } from '@angular/forms';
import { AuthService } from '../auth/service-center-auth';

@Component({
  selector: 'app-towing-invoice',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './towing-invoice.component.html',
  styleUrl: './towing-invoice.component.css'
})
export class TowingInvoiceComponent implements OnInit {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  adminName: string | null = null;
  serviceCenterName: string | null = null;
  towingRequest: any = null;
  invoice: any = null;
  invoiceId: string = '';
  serviceCenterInfo: any = null;
  requestId: string = '';
  mode: 'create' | 'view' = 'create';
  loading: boolean = false;
  error: string = '';

  // Invoice Data
  additionalServices: any[] = [];
  newAdditionalService: any = null;
  allServices: any[] = [];

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
      this.requestId = this.route.snapshot.paramMap.get('requestId') || '';
      this.invoiceId = this.route.snapshot.paramMap.get('invoiceId') || '';

      if (this.invoiceId) {
        // View mode - loading existing invoice
        this.mode = 'view';
        await this.loadInvoice(this.invoiceId);
        await this.loadServiceCenterInfo(this.towingRequest.serviceCenterId);
      } else if (this.requestId) {
        // Check if towing request already has an invoice
        await this.loadTowingRequest();

        if (this.towingRequest.invoiceId) {
          // Request already has invoice, redirect to view mode
          this.mode = 'view';
          await this.loadServiceCenterInfo(this.towingRequest.serviceCenterId);
          await this.loadInvoice(this.towingRequest.invoiceId);
        } else if (this.towingRequest.status === 'ongoing') {
          this.mode = 'create';
          await this.loadServiceCenterInfo(this.towingRequest.serviceCenterId);
        } else {
          this.error = 'Cannot generate invoice. Towing request must be in "Ongoing" status.';
          this.loading = false;
        }
      } else {
        this.error = 'No towing request ID or invoice ID provided';
        this.loading = false;
      }
    } catch (error) {
      console.error('Error initializing component:', error);
      this.error = 'Failed to initialize component';
      this.loading = false;
    }
  }

  async loadTowingRequest() {
    try {
      const requestRef = doc(this.firestore, 'towing_requests', this.requestId);
      const requestSnap = await getDoc(requestRef);

      if (requestSnap.exists()) {
        this.towingRequest = { id: requestSnap.id, ...requestSnap.data() };
        await this.enrichTowingRequestData();

        // Only initialize invoice data if in create mode
        if (this.mode === 'create') {
          this.initializeInvoiceData();
        }
      }
    } catch (error) {
      console.error('Error loading towing request:', error);
      alert('Failed to load towing request details');
    }
  }

  async loadInvoice(invoiceId: string) {
    this.loading = true;
    try {
      const invoiceRef = doc(this.firestore, 'towing_invoice', invoiceId);
      const invoiceSnap = await getDoc(invoiceRef);

      if (invoiceSnap.exists()) {
        this.invoice = { id: invoiceSnap.id, ...invoiceSnap.data() };

        if (this.invoice.towingRequestId) {
          await this.loadTowingRequestForInvoice(this.invoice.towingRequestId);
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

  private async loadTowingRequestForInvoice(requestId: string) {
    try {
      const requestRef = doc(this.firestore, 'towing_requests', requestId);
      const requestSnap = await getDoc(requestRef);

      if (requestSnap.exists()) {
        this.towingRequest = { id: requestSnap.id, ...requestSnap.data() };
        await this.enrichTowingRequestData();
      }
    } catch (error) {
      console.error('Error loading towing request for invoice:', error);
    }
  }

  async enrichTowingRequestData() {
    if (this.towingRequest.userId) {
      const userRef = doc(this.firestore, 'car_owners', this.towingRequest.userId);
      const uSnap = await getDoc(userRef);
      if (uSnap.exists()) {
        const userData = uSnap.data();
        this.towingRequest.customer = {
          id: this.towingRequest.userId,
          name: userData['name'],
          email: userData['email'],
          phone: userData['phone']
        };
      }
    }
  }

  initializeInvoiceData() {
    this.additionalServices = this.additionalServices || [];
    this.allServices = [...this.additionalServices];
    this.newAdditionalService = { name: '', unitPrice: 0, quantity: 1 };
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

  async generateInvoice() {
    if (!this.towingRequest) return;

    // Double-check that no invoice exists
    if (this.towingRequest.invoiceId) {
      alert('An invoice already exists for this towing request. Cannot generate a new one.');
      this.router.navigate(['/manage-towing-bookings']);
      return;
    }

    if (this.towingRequest.status !== 'ongoing') {
      alert('Cannot generate invoice. Towing request must be in "Ongoing" status.');
      return;
    }

    if (!this.towingRequest.serviceCenterId) {
      alert('Service center information is missing. Cannot generate invoice.');
      return;
    }

    this.serviceCenterName = await this.getServiceCenterName();

    try {
      const invoiceRef = doc(collection(this.firestore, 'towing_invoice'));
      const invoiceId = invoiceRef.id;

      const baseFee = this.towingRequest.pricingBreakdown?.baseFee || 0;
      const distanceCost = this.towingRequest.pricingBreakdown?.distanceCost || 0;
      const luxurySurcharge = this.towingRequest.pricingBreakdown?.luxurySurcharge || 0;
      const additionalServicesTotal = this.calculateAdditionalServicesTotal();

      const subtotal = baseFee + distanceCost + luxurySurcharge + additionalServicesTotal;
      const taxAmount = this.enableTax ? subtotal * this.taxRate : 0;
      const totalAmount = subtotal + taxAmount;

      const invoice = {
        invoiceId: invoiceId,
        towingRequestId: this.towingRequest.id,
        serviceCenterId: this.towingRequest.serviceCenterId,
        userId: this.towingRequest.userId,

        customerInfo: {
          name: this.towingRequest.customer?.name || this.towingRequest.name,
          email: this.towingRequest.customer?.email || this.towingRequest.email,
          phone: this.towingRequest.customer?.phone || this.towingRequest.contactNumber,
        },
        vehicleInfo: {
          make: this.towingRequest.vehicleInfo?.make,
          model: this.towingRequest.vehicleInfo?.model,
          year: this.towingRequest.vehicleInfo?.year,
          plateNumber: this.towingRequest.vehicleInfo?.plateNumber,
          sizeClass: this.towingRequest.vehicleInfo?.sizeClass
        },

        towingDetails: {
          towingType: this.towingRequest.towingType,
          distance: this.towingRequest.distance,
          coverageArea: this.towingRequest.coverageArea,
          responseTime: this.towingRequest.responseTime,
          estimatedDuration: this.towingRequest.estimatedDuration,
          description: this.towingRequest.description
        },

        locationInfo: {
          pickupAddress: this.towingRequest.location?.customer?.address?.full,
          serviceCenterAddress: this.towingRequest.serviceCenterContact?.address,
          coordinates: {
            pickup: {
              lat: this.towingRequest.location?.customer?.latitude,
              lng: this.towingRequest.location?.customer?.longitude
            }
          }
        },

        driverInfo: this.towingRequest.driverInfo ? {
          name: this.towingRequest.driverInfo.name,
          contactNumber: this.towingRequest.driverInfo.contactNumber,
          email: this.towingRequest.driverInfo.email,
          vehicle: this.towingRequest.driverVehicleInfo
        } : null,

        additionalServices: this.additionalServices,

        baseTowingCost: baseFee,
        additionalServicesTotal: additionalServicesTotal,
        subtotal: subtotal,
        taxAmount: taxAmount,
        totalAmount: totalAmount,

        pricingBreakdown: {
          baseFee: baseFee,
          distanceCost: distanceCost,
          distanceInKm: this.towingRequest.pricingBreakdown?.distanceInKm || 0,
          perKmRate: this.towingRequest.pricingBreakdown?.perKmRate || 0,
          luxurySurcharge: luxurySurcharge
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
        type: 'towing_invoice'
      };

      await setDoc(invoiceRef, invoice);

      // Update towing request status
       const towingRequestUpdate: any = {
      invoiceId: invoiceId,
      status: 'invoice_generated',
      updatedAt: Timestamp.now(),
      statusUpdatedBy: this.adminName || 'N/A',
      totalAmount: totalAmount
    };

    const newStatusHistory = {
      status: 'invoice_generated',
      timestamp: Timestamp.now(),
      updatedBy: this.adminName || 'system',
      notes: 'Invoice generated. Please proceed to make payment before collecting your vehicle.'
    };

    towingRequestUpdate.statusHistory = [...(this.towingRequest.statusHistory || []), newStatusHistory];

    towingRequestUpdate.timestamps = {
      ...this.towingRequest.timestamps,
      invoiceGeneratedAt: Timestamp.now()
    };

    await updateDoc(doc(this.firestore, 'towing_requests', this.towingRequest.id), towingRequestUpdate);


      alert('Towing invoice generated successfully!');
      window.location.reload();
    } catch (error) {
      console.error('Error generating towing invoice:', error);
      alert('Failed to generate invoice. Please try again.');
    }
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

  async getServiceCenterName(): Promise<string> {
    if (!this.towingRequest?.serviceCenterId) return 'N/A';

    const scRef = doc(this.firestore, 'service_centers', this.towingRequest.serviceCenterId);
    const scSnap = await getDoc(scRef);

    if (scSnap.exists()) {
      const data: any = scSnap.data();
      return data.serviceCenterInfo?.name || data.name || 'N/A';
    }
    return 'N/A';
  }

  // Additional Services Management
  addAdditionalService() {
    if (this.newAdditionalService?.name && this.newAdditionalService?.unitPrice != null) {

      const name = this.newAdditionalService.name;
      const quantity = this.newAdditionalService.quantity || 1;
      const unitPrice = this.newAdditionalService.unitPrice || this.newAdditionalService.price || 0;
      const totalPrice = quantity * unitPrice;

      const additionalService = {
        name,
        quantity,
        unitPrice,
        totalPrice
      };
      this.additionalServices = [...this.additionalServices, additionalService];
      this.newAdditionalService = { name: '', price: 0, quantity: 1 };
      this.allServices = [...this.additionalServices];
    }
  }

  updateAdditionalServiceTotal(service: any) {
    service.totalPrice = (service.quantity || 0) * (service.unitPrice || 0);
  }

  removeAdditionalService(index: number) {
    this.additionalServices.splice(index, 1);
    this.allServices = [...this.additionalServices];
  }

  calculateAdditionalServicesTotal(): number {
    return this.additionalServices.reduce((total: number, service: any) => {
      return total + (service.totalPrice || 0);
    }, 0);
  }

   onTaxToggleChange() {
    // Recalculate totals when tax is toggled
  }
  // Utility Methods
  calculateSubtotal(): number {
    const baseFee = this.towingRequest?.pricingBreakdown?.baseFee || 0;
    const distanceCost = this.towingRequest?.pricingBreakdown?.distanceCost || 0;
    const luxurySurcharge = this.towingRequest?.pricingBreakdown?.luxurySurcharge || 0;
    const additionalServicesTotal = this.calculateAdditionalServicesTotal();

    return baseFee + distanceCost + luxurySurcharge + additionalServicesTotal;
  }


  calculateTaxAmount(): number {
    if (!this.enableTax) return 0;
    return this.calculateSubtotal() * this.taxRate;
  }

  calculateTotal(): number {
    return this.calculateSubtotal() + this.calculateTaxAmount();
  }

  formatCurrency(amount: number): string {
    if (!amount) return 'RM0.00';
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: 'MYR'
    }).format(amount);
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

  formatDateTime(date: any): string {
    if (!date) return 'N/A';
    const jsDate = date.toDate ? date.toDate() : new Date(date);
    return jsDate.toLocaleDateString('en-MY', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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
    this.router.navigate(['/manage-towing-bookings']);
  }

  // View mode methods for existing invoices
  getInvoiceLabourItems(): any[] {
    if (!this.invoice) return [];

    const labourItems: any[] = [];

    // Base towing service
    if (this.invoice.baseTowingCost > 0) {
      labourItems.push({
        description: `Towing Service - ${this.invoice.towingDetails?.towingType || 'General Towing'}`,
        quantity: 1,
        unitPrice: this.invoice.baseTowingCost,
        amount: this.invoice.baseTowingCost
      });
    }

    // Additional services labour
    if (this.invoice.additionalServices && Array.isArray(this.invoice.additionalServices)) {
      this.invoice.additionalServices.forEach((service: any) => {
        const servicePrice = service.unitPrice || service.price || 0;
        if (servicePrice > 0) {
          labourItems.push({
            description: service.name || service.serviceName || 'Additional Service',
            quantity: service.quantity || 1,
            unitPrice: servicePrice,
            amount: servicePrice * (service.quantity || 1)
          });
        }
      });
    }

    return labourItems;
  }

  getInvoicePartsItems(): any[] {
    if (!this.invoice) return [];
    // Towing invoices typically don't have parts items
    return [];
  }

  hasInvoiceParts(): boolean {
    return false; // Towing invoices don't typically have parts
  }
}