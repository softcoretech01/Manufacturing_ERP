import os
import pymysql
from dotenv import load_dotenv

load_dotenv()

DB_HOST = os.getenv("DB_HOST", "187.127.131.38")
DB_PORT = int(os.getenv("DB_PORT", 3308))
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "Ener9y_Demo@2026")
DB_NAME = "ERP_Master"

def run_setup():
    print(f"Connecting to MySQL on {DB_HOST}:{DB_PORT} as {DB_USER}...")
    conn = pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        autocommit=True
    )
    cursor = conn.cursor()

    try:
        # Create Operation table
        print("Creating Operation table in ERP_Master...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS Operation (
                Id INT AUTO_INCREMENT PRIMARY KEY,
                Code VARCHAR(50) UNIQUE NOT NULL,
                Name VARCHAR(150),
                DefaultWorkCentre VARCHAR(50),
                SetupMinutes DECIMAL(10,2),
                CycleSeconds DECIMAL(10,2),
                Operators INT,
                Skill VARCHAR(50),
                QcCheckpoint BOOLEAN,
                Instructions VARCHAR(1000)
            )
        """)

        # Create Tool table
        print("Creating Tool table in ERP_Master...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS Tool (
                Id INT AUTO_INCREMENT PRIMARY KEY,
                Code VARCHAR(50) UNIQUE NOT NULL,
                Name VARCHAR(150),
                ToolType VARCHAR(50),
                LifeStrokes INT,
                ReplacementCost DECIMAL(10,2)
            )
        """)

        print("Seeding Operation and Tool data...")
        
        operations = [
            ('OP-010', 'Coil Cutting', 'WC-01', 30, 4, 1, 'Machine Operator', False, 'Set slitter to blank width per drawing. Check burr height under 0.05 mm on the first three pieces.'),
            ('OP-020', 'Deep Drawing', 'WC-02', 45, 8.5, 2, 'Press Operator', True, 'Verify die alignment and lubrication. First-article dimensional check before running the lot.'),
            ('OP-030', 'Trimming', 'WC-02', 15, 5, 1, 'Press Operator', False, 'Trim to drawn height. Collect trim scrap in the marked bin for weighment.'),
            ('OP-040', 'Neck Forming & Thread Rolling', 'WC-03', 20, 7.5, 1, 'Machine Operator', False, 'Roll thread to M44 × 3. Gauge every 50th piece with the go / no-go ring.'),
            ('OP-050', 'Bottom Welding', 'WC-04', 18, 10, 1, 'Certified Welder', True, 'TIG weld the bottom disc under argon. 100% visual, dye-penetrant on the first and last piece.'),
            ('OP-060', 'Vacuum Insulation', 'WC-05', 35, 12, 1, 'Machine Operator', False, 'Evacuate to 5 × 10⁻³ mbar, activate the getter, seal the pinch-off.'),
            ('OP-070', 'Leak Testing', 'WC-06', 5, 7.5, 1, 'QC Inspector', True, 'Helium leak test. Reject anything above 1 × 10⁻⁶ mbar·L/s.'),
            ('OP-080', 'Polishing', 'WC-10', 10, 18, 2, 'Skilled Operator', False, 'Buff to the specified finish. No circumferential scratches visible at arm’s length.'),
            ('OP-090', 'Powder Coating', 'WC-07', 25, 9, 3, 'Coating Operator', False, 'Degrease, coat to 60–80 µm, cure at 180 °C for 12 minutes. Log oven chart.'),
            ('OP-100', 'Logo Marking', 'WC-08', 12, 6, 1, 'Machine Operator', False, 'Laser mark per the artwork revision on the drawing. Verify position against the jig.'),
            ('OP-110', 'Lid Assembly', 'WC-10', 10, 14, 2, 'Assembly Operator', True, 'Fit the seal and thread insert, torque the cap to 1.2 Nm, sample-check with the torque gauge.'),
            ('OP-120', 'Final Assembly', 'WC-10', 8, 22, 2, 'Assembly Operator', True, 'Fit the lid, check thread engagement, wipe down and inspect the finish.'),
            ('OP-130', 'Cartoning & Packing', 'WC-09', 6, 15, 2, 'Packing Operator', False, 'Insert the manual, apply the barcode label, seal the carton and scan it into the pack list.'),
        ]

        cursor.executemany("""
            INSERT IGNORE INTO Operation 
            (Code, Name, DefaultWorkCentre, SetupMinutes, CycleSeconds, Operators, Skill, QcCheckpoint, Instructions)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, operations)

        tools = [
            ('TL-0001', 'Deep Draw Die — 750 ml Body', 'DIE', 250000, 480000),
            ('TL-0002', 'Deep Draw Die — 1000 ml Body', 'DIE', 250000, 512000),
            ('TL-0003', 'Neck Forming Punch Set', 'PUNCH', 400000, 96000),
            ('TL-0004', 'Bottom Weld Fixture — 73 mm', 'FIXTURE', 600000, 74000),
            ('TL-0005', 'Powder Coating Hanging Jig', 'JIG', 300000, 38000),
            ('TL-0006', 'Lid Assembly Torque Fixture', 'FIXTURE', 500000, 42000),
            ('TL-0007', 'Trim Die — 73 mm', 'DIE', 350000, 128000),
            ('TL-0008', 'Sipper Cap Injection Mould', 'MOULD', 800000, 1240000),
            ('TL-0009', 'Polishing Wheel Set — Mirror', 'WHEEL', 60000, 18000),
            ('TL-0010', 'Neck Thread Go / No-Go Gauge', 'GAUGE', 0, 22000),
        ]

        cursor.executemany("""
            INSERT IGNORE INTO Tool
            (Code, Name, ToolType, LifeStrokes, ReplacementCost)
            VALUES (%s, %s, %s, %s, %s)
        """, tools)

        print("Master tables setup completed in ERP_Master!")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        cursor.close()
        conn.close()

if __name__ == '__main__':
    run_setup()
