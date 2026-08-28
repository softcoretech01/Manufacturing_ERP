import pymysql
import os
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
load_dotenv(env_path)

db_host = os.getenv('DB_HOST', '187.127.131.38')
db_port = int(os.getenv('DB_PORT', 3308))
db_user = os.getenv('DB_USER', 'root')
db_password = os.getenv('DB_PASSWORD', 'Ener9y_Demo@2026')
db_name = 'ERP_Procurement'

def delete_data():
    print(f"Connecting to MySQL ({db_host}:{db_port})...")
    try:
        connection = pymysql.connect(
            host=db_host,
            port=db_port,
            user=db_user,
            password=db_password,
            database=db_name,
            client_flag=pymysql.constants.CLIENT.MULTI_STATEMENTS
        )
        cursor = connection.cursor()
        
        sql = """
        SET FOREIGN_KEY_CHECKS = 0;
        TRUNCATE TABLE PrLine;
        TRUNCATE TABLE ApprovalStep;
        TRUNCATE TABLE PurchaseRequisition;
        TRUNCATE TABLE RfqLine;
        TRUNCATE TABLE RfqSupplier;
        TRUNCATE TABLE RfqApprovalStep;
        TRUNCATE TABLE Rfq;
        TRUNCATE TABLE SupplierQuotationLine;
        TRUNCATE TABLE SupplierQuotation;
        TRUNCATE TABLE PurchaseOrderLine;
        TRUNCATE TABLE PurchaseOrderSchedule;
        TRUNCATE TABLE PurchaseOrderTax;
        TRUNCATE TABLE PurchaseOrderTerm;
        TRUNCATE TABLE PurchaseOrderApproval;
        TRUNCATE TABLE PurchaseOrderAmendment;
        TRUNCATE TABLE PurchaseOrderAmendmentChange;
        TRUNCATE TABLE PurchaseOrder;
        TRUNCATE TABLE IncomingInspectionParameter;
        TRUNCATE TABLE IncomingInspection;
        TRUNCATE TABLE GrnApproval;
        TRUNCATE TABLE GrnLine;
        TRUNCATE TABLE Grn;
        SET FOREIGN_KEY_CHECKS = 1;
        """
        
        cursor.execute(sql)
        connection.commit()
        print("All procurement data deleted successfully.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    delete_data()
