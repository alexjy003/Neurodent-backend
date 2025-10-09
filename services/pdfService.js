const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class PDFService {
  // Helper function to clean and format text for display
  static cleanDisplayText(text) {
    if (!text) return 'N/A';
    
    // Handle different data types
    if (typeof text === 'object' && text !== null) {
      // If it's a MongoDB document with _id, extract just the string ID
      if (text._id) {
        return text._id.toString();
      }
      // If it's an ObjectId directly
      if (text.toString && text.toString().match(/^[a-f\d]{24}$/i)) {
        return text.toString();
      }
      // For other objects, try to extract meaningful data
      if (text.name) return text.name.toString();
      if (text.value) return text.value.toString();
      
      // Last resort - convert to string and clean
      const objStr = text.toString();
      if (objStr === '[object Object]') {
        return 'N/A';
      }
      return objStr;
    }
    
    // Clean up the text string
    return text
      .toString()
      .trim()
      .replace(/[{}[\]"]/g, '') // Remove JSON brackets and quotes
      .replace(/ObjectId\([^)]+\)/g, '') // Remove ObjectId references
      .replace(/^\$/, '') // Remove leading dollar signs
      .replace(/_id:\s*[a-f\d]{24}/gi, '') // Remove _id: ObjectId patterns
      .replace(/,\s*_id:\s*/gi, '') // Remove trailing _id references
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim();
  }

  // Helper function to format names properly
  static formatName(firstName, lastName) {
    const first = this.cleanDisplayText(firstName);
    const last = this.cleanDisplayText(lastName);
    
    if (first === 'N/A' && last === 'N/A') return 'Unknown Patient';
    if (first === 'N/A') return last;
    if (last === 'N/A') return first;
    
    return `${first} ${last}`;
  }

  // Helper function to generate clean ID from ObjectId
  static generateCleanId(objectId, prefix = 'ID') {
    if (!objectId) return 'N/A';
    
    let cleanId = objectId;
    
    // If it's an object with _id property
    if (typeof objectId === 'object' && objectId._id) {
      cleanId = objectId._id.toString();
    } else if (typeof objectId === 'object') {
      cleanId = objectId.toString();
    } else {
      cleanId = objectId.toString();
    }
    
    // Extract just the ObjectId string if it exists
    const objectIdMatch = cleanId.match(/[a-f\d]{24}/i);
    if (objectIdMatch) {
      cleanId = objectIdMatch[0];
    }
    
    // Generate a clean, short ID
    if (cleanId.length >= 6) {
      return `${prefix}-${cleanId.substring(cleanId.length - 6).toUpperCase()}`;
    }
    
    return `${prefix}-${cleanId.toUpperCase()}`;
  }
  static generatePrescriptionPDF(prescription, doctor, patient) {
    return new Promise((resolve, reject) => {
      try {
        // Create a new PDF document with tighter margins
        const doc = new PDFDocument({
          size: 'A4',
          margins: {
            top: 40,
            bottom: 40,
            left: 40,
            right: 40
          }
        });

        // Buffer to store PDF data
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          resolve(pdfData);
        });

        // Header Section - Clinic Information (Compact)
        doc.fontSize(20)
           .fillColor('#1e40af')
           .text('NEURODENT DENTAL CLINIC', 40, 40, { align: 'center' });

        doc.fontSize(10)
           .fillColor('#64748b')
           .text('Professional Dental Care & Treatment', 40, 65, { align: 'center' })
           .text('📍 123 Dental Street, Medical District, City 12345 | 📞 +1 (555) 123-DENT', 40, 80, { align: 'center' });

        // Add horizontal line
        doc.strokeColor('#e5e7eb')
           .lineWidth(1)
           .moveTo(40, 100)
           .lineTo(555, 100)
           .stroke();

        // Prescription Header (Compact)
        doc.fontSize(16)
           .fillColor('#1f2937')
           .text('MEDICAL PRESCRIPTION', 40, 110, { align: 'center' });

        // Prescription ID and Date (Compact)
        const prescriptionDate = new Date(prescription.prescriptionDate || prescription.createdAt);
        const prescriptionId = prescription.prescriptionNumber || 
          this.generateCleanId(prescription._id, 'RX');
        
        doc.fontSize(9)
           .fillColor('#6b7280')
           .text(`Prescription ID: ${prescriptionId}`, 40, 135)
           .text(`Date: ${prescriptionDate.toLocaleDateString('en-US', { 
             year: 'numeric', 
             month: 'long', 
             day: 'numeric' 
           })}`, 350, 135);

        // Compact Info Boxes Side by Side
        let yPosition = 155;

        // Doctor Information Box (Smaller)
        doc.rect(40, yPosition, 250, 60)
           .strokeColor('#e5e7eb')
           .fillColor('#f8fafc')
           .fillAndStroke();

        doc.fontSize(10)
           .fillColor('#1f2937')
           .text('DOCTOR INFORMATION', 50, yPosition + 8);

        doc.fontSize(8)
           .fillColor('#374151')
           .text(`Dr. ${this.formatName(doctor.firstName, doctor.lastName)}`, 50, yPosition + 25)
           .text(`Specialty: ${this.cleanDisplayText(doctor.specialization || doctor.specialty) || 'General Dentistry'}`, 50, yPosition + 38)
           .text(`License: ${this.generateCleanId(doctor._id, 'DDS')}`, 50, yPosition + 51);

        // Patient Information Box (Smaller)
        doc.rect(305, yPosition, 250, 60)
           .strokeColor('#e5e7eb')
           .fillColor('#f8fafc')
           .fillAndStroke();

        doc.fontSize(10)
           .fillColor('#1f2937')
           .text('PATIENT INFORMATION', 315, yPosition + 8);

        const patientName = this.cleanDisplayText(prescription.patientName) || 
          (patient ? this.formatName(patient.firstName, patient.lastName) : 'Unknown Patient');
        
        // Handle age properly - ensure it's a number or N/A
        let patientAge = 'N/A';
        const ageValue = prescription.patientAge || patient?.age;
        if (ageValue !== null && ageValue !== undefined) {
          const cleanAge = this.cleanDisplayText(ageValue);
          const ageNumber = parseInt(cleanAge);
          if (!isNaN(ageNumber) && ageNumber > 0 && ageNumber < 150) {
            patientAge = ageNumber;
          }
        }
        
        // Generate a clean patient ID using the helper function
        const patientDisplayId = prescription.patientId ? 
          this.generateCleanId(prescription.patientId, 'PAT') : 'N/A';

        doc.fontSize(8)
           .fillColor('#374151')
           .text(`Name: ${patientName}`, 315, yPosition + 25)
           .text(`Age: ${patientAge} years`, 315, yPosition + 38)
           .text(`Patient ID: ${patientDisplayId}`, 315, yPosition + 51);

        yPosition += 75;

        // Diagnosis Section (Compact)
        doc.fontSize(12)
           .fillColor('#dc2626')
           .text('DIAGNOSIS', 40, yPosition);

        doc.rect(40, yPosition + 18, 515, 30)
           .strokeColor('#fecaca')
           .fillColor('#fef2f2')
           .fillAndStroke();

        doc.fontSize(10)
           .fillColor('#1f2937')
           .text(this.cleanDisplayText(prescription.diagnosis), 50, yPosition + 28, { width: 495 });

        yPosition += 60;

        // Symptoms Section (if available) - Compact
        if (prescription.symptoms) {
          doc.fontSize(12)
             .fillColor('#059669')
             .text('SYMPTOMS', 40, yPosition);

          doc.rect(40, yPosition + 18, 515, 25)
             .strokeColor('#a7f3d0')
             .fillColor('#f0fdf4')
             .fillAndStroke();

          doc.fontSize(9)
             .fillColor('#1f2937')
             .text(this.cleanDisplayText(prescription.symptoms), 50, yPosition + 25, { width: 495 });

          yPosition += 55;
        }

        // Medications Section (Compact)
        doc.fontSize(12)
           .fillColor('#7c3aed')
           .text('PRESCRIBED MEDICATIONS', 40, yPosition);

        yPosition += 20;

        prescription.medications.forEach((medication, index) => {
          // Compact medication box
          doc.rect(40, yPosition, 515, 50)
             .strokeColor('#c4b5fd')
             .fillColor('#faf5ff')
             .fillAndStroke();

          // Smaller medication number circle
          doc.circle(60, yPosition + 15, 10)
             .fillColor('#7c3aed')
             .fill();

          doc.fontSize(8)
             .fillColor('white')
             .text(`${index + 1}`, 57, yPosition + 12);

          // Compact medication details
          doc.fontSize(10)
             .fillColor('#1f2937')
             .text(this.cleanDisplayText(medication.name), 80, yPosition + 8);

          doc.fontSize(8)
             .fillColor('#4b5563')
             .text(`Dosage: ${this.cleanDisplayText(medication.dosage)}`, 80, yPosition + 23)
             .text(`Duration: ${this.cleanDisplayText(medication.duration)}`, 80, yPosition + 35);

          if (medication.frequency) {
            doc.text(`Frequency: ${this.cleanDisplayText(medication.frequency)}`, 280, yPosition + 23);
          }

          if (medication.instructions) {
            doc.text(`Instructions: ${this.cleanDisplayText(medication.instructions)}`, 280, yPosition + 35, { width: 220 });
          }

          yPosition += 60;
        });

        // General Instructions Section (Compact)
        if (prescription.generalInstructions) {
          doc.fontSize(11)
             .fillColor('#ea580c')
             .text('GENERAL INSTRUCTIONS', 40, yPosition);

          doc.rect(40, yPosition + 18, 515, 40)
             .strokeColor('#fed7aa')
             .fillColor('#fff7ed')
             .fillAndStroke();

          doc.fontSize(9)
             .fillColor('#1f2937')
             .text(this.cleanDisplayText(prescription.generalInstructions), 50, yPosition + 25, { width: 495 });

          yPosition += 70;
        }

        // Follow-up Date Section (Compact)
        if (prescription.followUpDate) {
          doc.fontSize(11)
             .fillColor('#0891b2')
             .text('FOLLOW-UP APPOINTMENT', 40, yPosition);

          doc.rect(40, yPosition + 18, 515, 25)
             .strokeColor('#a5f3fc')
             .fillColor('#f0fdff')
             .fillAndStroke();

          const followUpDate = new Date(prescription.followUpDate);
          doc.fontSize(9)
             .fillColor('#1f2937')
             .text(`Recommended follow-up date: ${followUpDate.toLocaleDateString('en-US', {
               year: 'numeric',
               month: 'long',
               day: 'numeric'
             })}`, 50, yPosition + 25);

          yPosition += 55;
        }

        // AI Generated Badge (if applicable) - Compact
        if (prescription.isAIGenerated) {
          doc.rect(420, yPosition, 135, 20)
             .fillColor('#f3e8ff')
             .strokeColor('#a855f7')
             .fillAndStroke();

          doc.fontSize(8)
             .fillColor('#7c3aed')
             .text('🤖 AI-ASSISTED PRESCRIPTION', 428, yPosition + 6);

          yPosition += 30;
        }

        // Compact Footer Section
        yPosition += 10;
        doc.strokeColor('#e5e7eb')
           .lineWidth(1)
           .moveTo(40, yPosition)
           .lineTo(555, yPosition)
           .stroke();

        doc.fontSize(7)
           .fillColor('#6b7280')
           .text('Important Notes: • Take medications as prescribed • Do not exceed recommended dosage', 40, yPosition + 8)
           .text('• Contact the clinic if you experience any adverse reactions • Keep this prescription for your records', 40, yPosition + 20);

        // Compact digital signature
        doc.fontSize(8)
           .fillColor('#374151')
           .text(`Digitally issued by Neurodent Clinic System on ${new Date().toLocaleString()}`, 40, yPosition + 35, { align: 'center' });

        // Finish the PDF
        doc.end();

      } catch (error) {
        reject(error);
      }
    });
  }
}

module.exports = PDFService;