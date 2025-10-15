import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Firestore, doc, getDoc, collection, setDoc, updateDoc, Timestamp } from '@angular/fire/firestore';
import { ReactiveFormsModule, FormBuilder, FormsModule } from '@angular/forms';
import { AuthService } from '../auth/service-center-auth';

@Component({
  selector: 'app-towing-payment',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './towing-payment.component.html',
  styleUrl: './towing-payment.component.css'
})
export class TowingPaymentComponent implements OnInit {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  adminName: string | null = null;
  towingRequest: any = null;
  invoice: any = null;
  requestId: string = '';
  serviceCenterInfo: any = null;

  // Payment Form
  paymentMethod: string = 'cash';
  amountPaid: number = 0;
  paymentNotes: string = '';
  cardNumber: string = '';
  cardExpiry: string = '';
  cardCVV: string = '';

  // E-Wallet properties
  ewalletProvider: string = '';
  ewalletTransactionId: string = '';
  ewalletReference: string = '';
  ewalletPhone: string = '';

  // Card properties
  cardAuthCode: string = '';
  cardTerminalId: string = '';

  // Bank transfer properties
  bankName: string = '';
  bankReference: string = '';
  bankTransactionDate: string = '';
  bankAmount: number = 0;

  // Cash properties
  cashTendered: number = 0;
  cashChange: number = 0;

  // Receipt Data
  receiptGenerated: boolean = false;
  receiptData: any = null;
  mode: string = 'view-receipt'; // 'payment' or 'view-receipt'
  loading: boolean = false;
  error: string = '';

  async ngOnInit() {
    this.requestId = this.route.snapshot.paramMap.get('id') || '';
    this.adminName = this.route.snapshot.paramMap.get('adminName') || '';

    const queryParams = this.route.snapshot.queryParams;
    const mode = queryParams['mode'];
    const receiptId = queryParams['receiptId'];

    const receiptKey = `towing_receipt_${this.requestId}`;
    const storedData = sessionStorage.getItem(receiptKey);
    let sessionData: any = null;

    if (storedData) {
      try {
        sessionData = JSON.parse(storedData);
      } catch (err) {
        console.warn('Invalid session data:', err);
      }
    }

    if (mode === 'view-receipt') {
      this.mode = 'view-receipt';

      if (sessionData?.receiptId) {
        await this.loadReceiptById(sessionData.receiptId);

        // Try to get towing request (for service center)
        if (sessionData?.towingRequestId) {
          await this.loadTowingRequestById(sessionData.towingRequestId);
        }

        if (this.receiptData?.serviceCenterId) {
          await this.loadServiceCenterInfo(this.receiptData.serviceCenterId);
        } else if (this.towingRequest?.serviceCenterId) {
          await this.loadServiceCenterInfo(this.towingRequest.serviceCenterId);
        }

        sessionStorage.removeItem(receiptKey);
        return;
      }

      if (receiptId) {
        await this.loadReceiptById(receiptId);
        if (this.receiptData?.towingRequestId) {
          await this.loadTowingRequestById(this.receiptData.towingRequestId);
        }
        if (this.receiptData?.serviceCenterId) {
          await this.loadServiceCenterInfo(this.receiptData.serviceCenterId);
        }
        return;
      }
    }

    const navigation = this.router.getCurrentNavigation();
    const navigationState = navigation?.extras?.state as any;

    if (navigationState?.mode === 'view-receipt' && navigationState.receiptData) {
      this.mode = 'view-receipt';
      this.receiptData = navigationState.receiptData;
      this.receiptGenerated = true;

      if (navigationState.towingRequest) {
        this.towingRequest = navigationState.towingRequest;
      }

      if (this.receiptData?.serviceCenterId) {
        await this.loadServiceCenterInfo(this.receiptData.serviceCenterId);
      } else if (this.towingRequest?.serviceCenterId) {
        await this.loadServiceCenterInfo(this.towingRequest.serviceCenterId);
      }

      return;
    }

    if (this.requestId) {
      await this.loadTowingRequestAndInvoice();
    }
  }

  async loadTowingRequestById(requestId: string) {
    const reqRef = doc(this.firestore, 'towing_requests', requestId);
    const snap = await getDoc(reqRef);
    if (snap.exists()) {
      this.towingRequest = { id: snap.id, ...snap.data() };
    } else {
      console.warn('Towing request not found:', requestId);
    }
  }

  async loadReceiptById(receiptId: string) {
    try {
      // Check if it's a proper receipt ID or a temporary one
      if (receiptId.startsWith('REC-')) {
        // Temporary receipt - load from invoice
        const invoiceId = receiptId.replace('REC-', '');
        await this.loadTowingRequestAndInvoice();
      } else {
        // Actual receipt ID - load from receipts collection
        const receiptRef = doc(this.firestore, 'towing_receipts', receiptId);
        const receiptSnap = await getDoc(receiptRef);

        if (receiptSnap.exists()) {
          this.receiptData = { id: receiptSnap.id, ...receiptSnap.data() };
          this.receiptGenerated = true;
          this.mode = 'view-receipt';

          // Load towing request data
          await this.loadTowingRequest();

          // Load service center info
          if (this.receiptData.serviceCenterId) {
            await this.loadServiceCenterInfo(this.receiptData.serviceCenterId);
          }
        }
      }
    } catch (error) {
      console.error('Error loading receipt:', error);
      alert('Failed to load receipt data.');
    }
  }

  async loadTowingRequestAndInvoice() {
    try {
      // Load towing request
      await this.loadTowingRequest();

      // Load invoice
      if (this.towingRequest?.invoiceId) {
        const invoiceRef = doc(this.firestore, 'towing_invoice', this.towingRequest.invoiceId);
        const invoiceSnap = await getDoc(invoiceRef);

        if (invoiceSnap.exists()) {
          this.invoice = { id: invoiceSnap.id, ...invoiceSnap.data() };
          console.log('Loaded Towing Invoice:', this.invoice);

          // Load service center info
          if (this.towingRequest.serviceCenterId) {
            await this.loadServiceCenterInfo(this.towingRequest.serviceCenterId);
          }

          // Set amount paid to invoice total if not already set
          if (!this.amountPaid && this.invoice.totalAmount) {
            this.amountPaid = this.invoice.totalAmount;
          }
        }
      }
    } catch (error) {
      console.error('Error loading towing request and invoice:', error);
      alert('Failed to load payment details');
    }
  }

  async loadTowingRequest() {
    try {
      const requestRef = doc(this.firestore, 'towing_requests', this.requestId);
      const requestSnap = await getDoc(requestRef);

      if (requestSnap.exists()) {
        this.towingRequest = { id: requestSnap.id, ...requestSnap.data() };
        console.log('Loaded Towing Request:', this.towingRequest);
      } else {
        alert('Towing request not found');
      }
    } catch (error) {
      console.error('Error loading towing request:', error);
      alert('Failed to load towing request details');
    }
  }

  async loadServiceCenterInfo(scId: string) {
    try {
      const scRef = doc(this.firestore, 'service_centers', scId);
      const scSnap = await getDoc(scRef);

      if (scSnap.exists()) {
        this.serviceCenterInfo = {
          id: scSnap.id,
          ...scSnap.data()
        };
        console.log('Loaded Service Center:', this.serviceCenterInfo);
      }
    } catch (error) {
      console.error('Failed loading service center info', error);
    }
  }

  onPaymentMethodChange() {
    this.ewalletProvider = '';
    this.ewalletTransactionId = '';
    this.ewalletReference = '';
    this.ewalletPhone = '';
    this.cardNumber = '';
    this.cardExpiry = '';
    this.cardCVV = '';
    this.cardAuthCode = '';
    this.cardTerminalId = '';
    this.bankName = '';
    this.bankReference = '';
    this.bankTransactionDate = '';
    this.bankAmount = 0;
    this.cashTendered = 0;
    this.cashChange = 0;
  }

  onAmountPaidChange() {
    if (this.paymentMethod === 'cash') {
      this.cashTendered = this.amountPaid;
      this.calculateCashChange();
    }

    if (this.paymentMethod === 'bank_transfer') {
      this.bankAmount = this.amountPaid;
    }
  }

  calculateCashChange() {
    if (this.paymentMethod === 'cash' && this.cashTendered > 0) {
      const remainingBalance = this.getRemainingBalance();
      this.cashChange = Math.max(0, this.cashTendered - this.amountPaid);
    } else {
      this.cashChange = 0;
    }
  }

  getPreviousAmountPaid(): number {
    if (!this.invoice) return 0;
    return this.invoice.payment?.amountPaid || 0;
  }

  // Calculate remaining balance
  getRemainingBalance(): number {
    if (!this.invoice) return 0;
    const totalAmount = this.invoice.totalAmount || 0;
    const previousPaid = this.getPreviousAmountPaid();
    return Math.max(0, totalAmount - previousPaid);
  }

  getPaymentStatusBadge(): string {
    if (!this.amountPaid || this.amountPaid <= 0) {
      return 'bg-secondary';
    }

    const remainingBalance = this.getRemainingBalance();

    if (this.amountPaid >= remainingBalance) {
      return 'bg-success';
    } else if (this.amountPaid > 0) {
      return 'bg-warning';
    } else {
      return 'bg-secondary';
    }
  }

  getPaymentStatusText(): string {
    if (!this.amountPaid || this.amountPaid <= 0) {
      return 'No Payment';
    }

    const remainingBalance = this.getRemainingBalance();

    if (this.amountPaid >= remainingBalance) {
      return 'Full Settlement';
    } else if (this.amountPaid > 0) {
      return 'Additional Payment';
    } else {
      return 'No Payment';
    }
  }

  getPaymentButtonText(): string {
    if (!this.amountPaid || this.amountPaid <= 0) {
      return 'Process Payment';
    }

    const remainingBalance = this.getRemainingBalance();
    const previousPaid = this.getPreviousAmountPaid();

    if (this.amountPaid >= remainingBalance) {
      return `Settle Balance (${this.formatCurrency(remainingBalance)})`;
    } else if (previousPaid > 0) {
      return `Add Payment (${this.formatCurrency(this.amountPaid)})`;
    } else {
      return `Process Payment (${this.formatCurrency(this.amountPaid)})`;
    }
  }

  async processPayment() {
    if (!this.towingRequest || !this.invoice) {
      alert('Missing towing request or invoice data');
      return;
    }

    if (!this.paymentMethod || !this.amountPaid || this.amountPaid <= 0) {
      alert('Please fill in all required payment details');
      return;
    }

    const isFullPayment = this.amountPaid >= this.invoice.totalAmount;
    const isPartialPayment = this.amountPaid > 0 && this.amountPaid < this.invoice.totalAmount;

    if (isPartialPayment) {
      if (!confirm(`This is a partial payment of ${this.formatCurrency(this.amountPaid)}. Balance due: ${this.formatCurrency(this.invoice.totalAmount - this.amountPaid)}. Continue?`)) {
        return;
      }
    }

    try {
      // Determine payment status based on amount paid
      const paymentStatus = isFullPayment ? 'paid' : 'partial';
      const requestStatus = isFullPayment ? 'completed' : 'pending_payment';

      // Update invoice with payment details
      const invoiceUpdate: any = {
        'payment.method': this.paymentMethod,
        'payment.status': paymentStatus,
        'payment.paidAt': Timestamp.now(),
        'payment.amountPaid': this.amountPaid,
        'payment.notes': this.paymentNotes,
        'payment.balanceDue': Math.max(0, this.invoice.totalAmount - this.amountPaid),
        status: paymentStatus,
        updatedAt: Timestamp.now()
      };

      if (this.paymentMethod === 'card') {
        invoiceUpdate['payment.cardLastFour'] = this.cardNumber.slice(-4);
        invoiceUpdate['payment.transactionId'] = this.generateTransactionId();
        invoiceUpdate['payment.authorizationCode'] = this.cardAuthCode;
        invoiceUpdate['payment.terminalId'] = this.cardTerminalId;
      } else if (this.paymentMethod === 'ewallet') {
        invoiceUpdate['payment.ewalletProvider'] = this.ewalletProvider;
        invoiceUpdate['payment.ewalletTransactionId'] = this.ewalletTransactionId;
        invoiceUpdate['payment.ewalletReference'] = this.ewalletReference;
        invoiceUpdate['payment.ewalletPhone'] = this.ewalletPhone;
      } else if (this.paymentMethod === 'bank_transfer') {
        invoiceUpdate['payment.bankName'] = this.bankName;
        invoiceUpdate['payment.bankReference'] = this.bankReference;
        invoiceUpdate['payment.bankTransactionDate'] = this.bankTransactionDate;
        invoiceUpdate['payment.bankAmount'] = this.bankAmount;
      } else if (this.paymentMethod === 'cash') {
        invoiceUpdate['payment.cashTendered'] = this.cashTendered;
        invoiceUpdate['payment.cashChange'] = this.cashChange;
      }

      await updateDoc(doc(this.firestore, 'towing_invoice', this.invoice.id), invoiceUpdate);

      // Create receipt (even for partial payments)
      const receiptRef = doc(collection(this.firestore, 'towing_receipts'));
      const receiptId = receiptRef.id;

      const receipt = {
        receiptId: receiptId,
        invoiceId: this.invoice.id,
        towingRequestId: this.towingRequest.id,
        serviceCenterId: this.towingRequest.serviceCenterId,
        userId: this.towingRequest.userId,

        // Customer and Vehicle Info
        customerInfo: this.invoice.customerInfo || {
          name: this.towingRequest.customer?.name || this.towingRequest.name,
          email: this.towingRequest.customer?.email || this.towingRequest.email,
          phone: this.towingRequest.customer?.phone || this.towingRequest.contactNumber,
        },
        vehicleInfo: this.invoice.vehicleInfo || {
          make: this.towingRequest.vehicleInfo?.make,
          model: this.towingRequest.vehicleInfo?.model,
          year: this.towingRequest.vehicleInfo?.year,
          plateNumber: this.towingRequest.vehicleInfo?.plateNumber,
          sizeClass: this.towingRequest.vehicleInfo?.sizeClass
        },

        // Towing Details
        towingDetails: {
          towingType: this.invoice.towingDetails?.towingType,
          distance: this.invoice.towingDetails?.distance,
          coverageArea: this.invoice.towingDetails?.coverageArea,
          responseTime: this.invoice.towingDetails?.responseTime
        },

        // Driver Information
        driverInfo: this.invoice.driverInfo,

        // Services Data
        additionalServices: this.invoice.additionalServices || [],

        // Financial Data
        baseTowingCost: this.invoice.pricingBreakdown?.baseFee || 0,
        distanceCost: this.invoice.pricingBreakdown?.distanceCost || 0,
        distanceInKm: this.invoice.pricingBreakdown?.distanceInKm || 0,
        perKmRate: this.invoice.pricingBreakdown?.perKmRate || 0,
        luxurySurcharge: this.invoice.pricingBreakdown?.luxurySurcharge || 0,
        additionalServicesTotal: this.invoice?.additionalServicesTotal || 0,
        subtotal: this.invoice.subtotal || 0,
        taxAmount: this.invoice.taxAmount || 0,
        totalAmount: this.invoice.totalAmount || 0,
        amountPaid: this.amountPaid,
        balanceDue: Math.max(0, this.invoice.totalAmount - this.amountPaid),

        // Payment Information
        payment: {
          method: this.paymentMethod,
          status: paymentStatus,
          paidAt: Timestamp.now(),
          notes: this.paymentNotes,
          amountPaid: this.amountPaid,
          balanceDue: Math.max(0, this.invoice.totalAmount - this.amountPaid),
          // Add method-specific details
          ...(this.paymentMethod === 'card' && {
            cardLastFour: this.cardNumber.slice(-4),
            transactionId: this.generateTransactionId(),
            authorizationCode: this.cardAuthCode,
            terminalId: this.cardTerminalId
          }),
          ...(this.paymentMethod === 'ewallet' && {
            ewalletProvider: this.ewalletProvider,
            ewalletTransactionId: this.ewalletTransactionId,
            ewalletReference: this.ewalletReference,
            ewalletPhone: this.ewalletPhone
          }),
          ...(this.paymentMethod === 'bank_transfer' && {
            bankName: this.bankName,
            bankReference: this.bankReference,
            bankTransactionDate: this.bankTransactionDate,
            bankAmount: this.bankAmount
          }),
          ...(this.paymentMethod === 'cash' && {
            cashTendered: this.cashTendered,
            cashChange: this.cashChange
          })
        },

        issuedAt: Timestamp.now(),
        issuedBy: this.serviceCenterInfo?.serviceCenterInfo?.name + ' - ' + this.adminName || 'system',
        type: isFullPayment ? 'final_receipt' : 'partial_receipt',
        status: paymentStatus
      };

      await setDoc(receiptRef, receipt);

      // Update towing request status (only complete if full payment)
      const requestUpdate: any = {
        receiptId: receiptId,
        status: requestStatus,
        'payment.method': this.paymentMethod,
        'payment.status': paymentStatus,
        'payment.total': this.amountPaid,
        'payment.taxAmount': this.invoice.taxAmount || 0,
        'payment.additionalFees': this.invoice?.additionalServicesTotal || 0,
        'payment.paidAt': Timestamp.now(),
        'payment.balanceDue': Math.max(0, this.invoice.totalAmount - this.amountPaid),
        updatedAt: Timestamp.now(),
        statusUpdatedBy: this.adminName || 'system'
      };

      const paymentStatusText = isFullPayment ? 'completed' : 'pending_payment';
      const paymentNotes = isFullPayment
        ? `Full payment of ${this.formatCurrency(this.amountPaid)} received. Towing Service completed.`
        : `Partial payment of ${this.formatCurrency(this.amountPaid)} received. Balance due: ${this.formatCurrency(this.invoice.totalAmount - this.amountPaid)}`;

      const newStatusHistory = {
        status: paymentStatusText,
        timestamp: Timestamp.now(),
        updatedBy: this.adminName || 'system',
        notes: paymentNotes
      };

      requestUpdate.statusHistory = [...(this.towingRequest.statusHistory || []), newStatusHistory];

      requestUpdate.timestamps = {
        ...this.towingRequest.timestamps,
        ...(isFullPayment && { completedAt: Timestamp.now() }),
        paymentProcessedAt: Timestamp.now()
      };


      await updateDoc(doc(this.firestore, 'towing_requests', this.towingRequest.id), requestUpdate);

      // Set receipt data for display
      this.receiptData = receipt;
      this.receiptGenerated = true;
      this.mode = 'view-receipt';

      await this.loadTowingRequestAndInvoice();

      const message = isFullPayment
        ? 'Payment processed successfully! Receipt generated.'
        : `Partial payment of ${this.formatCurrency(this.amountPaid)} processed. Balance due: ${this.formatCurrency(this.invoice.totalAmount - this.amountPaid)}`;

      alert(message);
    } catch (error) {
      console.error('Error processing payment:', error);
      alert('Failed to process payment. Please try again.');
    }
  }

  getReceiptLabourItems(): any[] {
    if (!this.receiptData) return [];

    const labourItems: any[] = [];

    // Base towing service
    if (this.receiptData.baseTowingCost > 0) {
      labourItems.push({
        description: `Towing Service - ${this.receiptData.towingDetails?.towingType || 'General Towing'}`,
        quantity: 1,
        unitPrice: this.receiptData.baseTowingCost,
        amount: this.receiptData.baseTowingCost
      });
    }

    // Additional services
    if (this.receiptData.additionalServices && Array.isArray(this.receiptData.additionalServices)) {
      this.receiptData.additionalServices.forEach((service: any) => {
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

  getReceiptPartsItems(): any[] {
    // Towing receipts typically don't have parts items
    return [];
  }

  hasReceiptParts(): boolean {
    return false;
  }

  getPaymentMethodDisplay(method: string): string {
    const methodDisplay: { [key: string]: string } = {
      'cash': 'Cash',
      'card': 'Credit/Debit Card',
      'ewallet': 'E-Wallet',
      'bank_transfer': 'Bank Transfer',
      'pending': 'Pending'
    };
    return methodDisplay[method] || method;
  }

  getPaymentStatusDisplay(status: string): string {
    const statusDisplay: { [key: string]: string } = {
      'paid': 'Paid',
      'unpaid': 'Unpaid',
      'refunded': 'Refunded',
      'partial': 'Pending',
    };
    return statusDisplay[status] || status;
  }

  // Utility Methods
  generateTransactionId(): string {
    const timestamp = new Date().getTime();
    const random = Math.floor(Math.random() * 10000);
    return `TXN-${timestamp}-${random}`;
  }

  formatCurrency(amount: number): string {
    if (!amount && amount !== 0) return 'RM0.00';
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: 'MYR',
      minimumFractionDigits: 2
    }).format(amount);
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';
    const jsDate = date.toDate ? date.toDate() : new Date(date.seconds * 1000 + (date.nanoseconds || 0) / 1000000);
    return jsDate.toLocaleDateString('en-MY', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  formatDateTime(date: any): string {
    if (!date) return 'N/A';
    const jsDate = date.toDate ? date.toDate() : new Date(date.seconds * 1000 + (date.nanoseconds || 0) / 1000000);
    return jsDate.toLocaleString('en-MY', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  printReceipt() {
    window.print();
  }

  shareReceipt(): void {
    alert('Share receipt functionality to be implemented');
  }

  completeAndReturn() {
    this.router.navigate(['/manage-towing-bookings']);
  }
}