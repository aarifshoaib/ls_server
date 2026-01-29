import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import { PayrollArchiveService } from '../services/payrollArchive.service';
import * as XLSX from 'xlsx';

export class PayrollArchiveController {
  static async getAll(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      let result = await PayrollArchiveService.getArchives(req.query, req.query);

      if ((result.data || []).length === 0) {
        const userId = req.user?._id.toString() || '';
        await PayrollArchiveService.backfillFromFinalizedRuns(userId);
        result = await PayrollArchiveService.getArchives(req.query, req.query);
      }

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const archive = await PayrollArchiveService.getArchiveById(req.params.id);

      res.json({
        success: true,
        data: archive,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getByPayrollRunId(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const archive = await PayrollArchiveService.getByPayrollRunId(req.params.payrollRunId);

      res.json({
        success: true,
        data: archive,
      });
    } catch (error) {
      next(error);
    }
  }

  static async createFromPayrollRun(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const payrollRunId = req.params.payrollRunId || req.body.payrollRunId;
      const archive = await PayrollArchiveService.createFromPayrollRun(payrollRunId, userId);

      res.status(201).json({
        success: true,
        data: archive,
        message: 'Payroll archived successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async getEmployeePayslip(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const { archiveId, employeeId } = req.params;
      const payslip = await PayrollArchiveService.getEmployeePayslip(archiveId, employeeId);

      res.json({
        success: true,
        data: payslip,
      });
    } catch (error) {
      next(error);
    }
  }

  static async exportArchive(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const archive = await PayrollArchiveService.getArchiveById(req.params.id);

      const snapshots = archive.employeeSnapshots || [];
      const payCycleName = archive.payCycleName || '';

      const getDeductionsTotal = (snap: any) => {
        if (snap.totalDeductions !== undefined || snap.totalAdvanceDeductions !== undefined) {
          return (snap.totalDeductions || 0) + (snap.totalAdvanceDeductions || 0);
        }
        const deductionSum = (snap.deductions || []).reduce((sum: number, d: any) => sum + (d.amount || 0), 0);
        const advanceSum = (snap.advanceDeductions || []).reduce((sum: number, a: any) => sum + (a.amount || 0), 0);
        return deductionSum + advanceSum;
      };

      const workbook = XLSX.utils.book_new();

      const payslipsSheet = XLSX.utils.aoa_to_sheet([
        ['Employee Code', 'Employee Name', 'Gross Salary', 'Total Deductions', 'Net Salary'],
        ...snapshots.map((snap: any) => [
          snap.employeeCode || '',
          snap.employeeName || '',
          snap.grossSalary ?? 0,
          getDeductionsTotal(snap),
          snap.netSalary ?? 0,
        ]),
        [],
        ['TOTAL', '', snapshots.reduce((sum: number, s: any) => sum + (s.grossSalary || 0), 0),
          snapshots.reduce((sum: number, s: any) => sum + getDeductionsTotal(s), 0),
          snapshots.reduce((sum: number, s: any) => sum + (s.netSalary || 0), 0),
        ],
      ]);
      XLSX.utils.book_append_sheet(workbook, payslipsSheet, 'Payslips');

      const singleLineSheet = XLSX.utils.aoa_to_sheet([
        [
          'Employee Code',
          'Employee Name',
          'Email',
          'Phone',
          'Department',
          'Pay Cycle',
          'Basic Salary',
          'Gross Salary',
          'Total Deductions',
          'Net Salary',
        ],
        ...snapshots.map((snap: any) => [
          snap.employeeCode || '',
          snap.employeeName || '',
          snap.employeeEmail || '',
          snap.employeePhone || '',
          snap.department || '',
          payCycleName,
          snap.basicSalary ?? 0,
          snap.grossSalary ?? 0,
          getDeductionsTotal(snap),
          snap.netSalary ?? 0,
        ]),
        [],
        [
          'TOTAL',
          '',
          '',
          '',
          '',
          '',
          snapshots.reduce((sum: number, s: any) => sum + (s.basicSalary || 0), 0),
          snapshots.reduce((sum: number, s: any) => sum + (s.grossSalary || 0), 0),
          snapshots.reduce((sum: number, s: any) => sum + getDeductionsTotal(s), 0),
          snapshots.reduce((sum: number, s: any) => sum + (s.netSalary || 0), 0),
        ],
      ]);
      XLSX.utils.book_append_sheet(workbook, singleLineSheet, 'Single Line');

      const multiLineRows: any[] = [];
      snapshots.forEach((snap: any) => {
        (snap.earnings || []).forEach((earning: any) => {
          multiLineRows.push([
            snap.employeeCode || '',
            snap.employeeName || '',
            snap.department || '',
            payCycleName,
            'Earning',
            earning.componentName || earning.componentCode || '',
            earning.amount || 0,
          ]);
        });
        (snap.deductions || []).forEach((deduction: any) => {
          multiLineRows.push([
            snap.employeeCode || '',
            snap.employeeName || '',
            snap.department || '',
            payCycleName,
            'Deduction',
            deduction.componentName || deduction.componentCode || '',
            deduction.amount || 0,
          ]);
        });
        (snap.advanceDeductions || []).forEach((advance: any) => {
          multiLineRows.push([
            snap.employeeCode || '',
            snap.employeeName || '',
            snap.department || '',
            payCycleName,
            'Advance',
            advance.advanceNumber || 'Advance',
            advance.amount || 0,
          ]);
        });
      });

      const multiLineSheet = XLSX.utils.aoa_to_sheet([
        ['Employee Code', 'Employee Name', 'Department', 'Pay Cycle', 'Type', 'Component', 'Amount'],
        ...multiLineRows,
        [],
        ['TOTAL', '', '', '', '', '', multiLineRows.reduce((sum, row) => sum + (row[6] || 0), 0)],
      ]);
      XLSX.utils.book_append_sheet(workbook, multiLineSheet, 'Multi Line');

      const earningsTotals: Record<string, number> = {};
      snapshots.forEach((snap: any) => {
        (snap.earnings || []).forEach((earning: any) => {
          const key = earning.componentCode || earning.componentName;
          if (!key) return;
          earningsTotals[key] = (earningsTotals[key] || 0) + (earning.amount || 0);
        });
      });
      const earningsSheet = XLSX.utils.aoa_to_sheet([
        ['Component', 'Total Amount'],
        ...Object.entries(earningsTotals).map(([key, amount]) => [key, amount]),
        [],
        ['TOTAL', Object.values(earningsTotals).reduce((sum, amount) => sum + amount, 0)],
      ]);
      XLSX.utils.book_append_sheet(workbook, earningsSheet, 'Earnings');

      const deductionsTotals: Record<string, number> = {};
      snapshots.forEach((snap: any) => {
        (snap.deductions || []).forEach((deduction: any) => {
          const key = deduction.componentCode || deduction.componentName;
          if (!key) return;
          deductionsTotals[key] = (deductionsTotals[key] || 0) + (deduction.amount || 0);
        });
        (snap.advanceDeductions || []).forEach((advance: any) => {
          deductionsTotals.ADVANCE = (deductionsTotals.ADVANCE || 0) + (advance.amount || 0);
        });
      });
      const deductionsSheet = XLSX.utils.aoa_to_sheet([
        ['Component', 'Total Amount'],
        ...Object.entries(deductionsTotals).map(([key, amount]) => [key, amount]),
        [],
        ['TOTAL', Object.values(deductionsTotals).reduce((sum, amount) => sum + amount, 0)],
      ]);
      XLSX.utils.book_append_sheet(workbook, deductionsSheet, 'Deductions');

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=payroll-archive-${archive.archiveNumber}.xlsx`,
      });
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  }

  static async getEmployeePayslipHistory(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await PayrollArchiveService.getEmployeePayslipHistory(req.params.employeeId, req.query);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async lock(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const archive = await PayrollArchiveService.lockArchive(req.params.id, userId);

      res.json({
        success: true,
        data: archive,
        message: 'Archive locked successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateFiles(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const archive = await PayrollArchiveService.updateFiles(req.params.id, req.body, userId);

      res.json({
        success: true,
        data: archive,
        message: 'Archive files updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async getStatistics(_req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const statistics = await PayrollArchiveService.getStatistics();

      res.json({
        success: true,
        data: statistics,
      });
    } catch (error) {
      next(error);
    }
  }
}
