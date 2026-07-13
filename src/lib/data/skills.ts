/**
 * Skills taxonomy for the Projects section — LinkedIn-style: exhaustive,
 * searchable, never free-typed. Spans software, data/AI, hardware, science
 * & lab methods, research, design, business, communication, healthcare,
 * legal, trades, and leadership so any student project can be tagged with
 * what it actually demonstrates.
 */

export const SKILLS: readonly string[] = [
  // ── Programming languages
  "Python", "JavaScript", "TypeScript", "Java", "C", "C++", "C#", "Go",
  "Rust", "Swift", "Kotlin", "Ruby", "PHP", "R", "MATLAB", "Julia", "Scala",
  "Haskell", "Perl", "Dart", "Objective-C", "Assembly", "SQL", "Bash / Shell",
  "Solidity", "Fortran", "COBOL", "Lua", "Elixir", "OCaml", "Zig",
  // ── Web & app development
  "React", "Next.js", "Vue.js", "Angular", "Svelte", "Node.js", "Express",
  "Django", "Flask", "FastAPI", "Ruby on Rails", "Spring Boot", "Laravel",
  "ASP.NET", "GraphQL", "REST API Design", "HTML/CSS", "Tailwind CSS",
  "WebAssembly", "React Native", "Flutter", "SwiftUI", "Android Development",
  "iOS Development", "Electron", "WordPress", "Webflow", "Progressive Web Apps",
  "Web Accessibility", "SEO",
  // ── Data, AI & ML
  "Machine Learning", "Deep Learning", "Natural Language Processing",
  "Computer Vision", "Reinforcement Learning", "Large Language Models",
  "Prompt Engineering", "TensorFlow", "PyTorch", "scikit-learn", "Keras",
  "Hugging Face", "LangChain", "Data Analysis", "Data Visualization",
  "Data Engineering", "ETL Pipelines", "Pandas", "NumPy", "Spark", "Hadoop",
  "Tableau", "Power BI", "Excel (Advanced)", "Statistics", "A/B Testing",
  "Time Series Analysis", "Recommender Systems", "MLOps", "Data Mining",
  "Big Data", "Bioinformatics", "Computational Biology", "Geospatial Analysis / GIS",
  // ── Databases & infrastructure
  "PostgreSQL", "MySQL", "MongoDB", "Redis", "SQLite", "Firebase", "Supabase",
  "Elasticsearch", "Database Design", "AWS", "Google Cloud", "Microsoft Azure",
  "Docker", "Kubernetes", "Terraform", "CI/CD", "Linux", "Git", "DevOps",
  "Serverless Architecture", "Microservices", "System Design",
  "Networking (Computer)", "Vercel", "Cloudflare",
  // ── Security
  "Cybersecurity", "Penetration Testing", "Cryptography", "Network Security",
  "Security Auditing", "Reverse Engineering", "Digital Forensics",
  "Ethical Hacking", "CTF Competitions",
  // ── Hardware, robotics & engineering
  "Arduino", "Raspberry Pi", "Embedded Systems", "FPGA", "PCB Design",
  "Robotics", "ROS", "Control Systems", "Signal Processing", "IoT",
  "3D Printing", "CAD (SolidWorks)", "CAD (AutoCAD)", "CAD (Fusion 360)",
  "Finite Element Analysis", "CNC Machining", "Circuit Design",
  "Mechanical Design", "Aerodynamics", "Structural Analysis", "HVAC Design",
  "Renewable Energy Systems", "Battery Systems", "Automotive Engineering",
  "Drone Operation", "Soldering", "Welding", "Machining",
  // ── Science & laboratory
  "Wet Lab Techniques", "PCR", "Gel Electrophoresis", "Cell Culture",
  "CRISPR / Gene Editing", "Western Blot", "Microscopy", "Flow Cytometry",
  "Chromatography", "Mass Spectrometry", "Spectroscopy", "Titration",
  "Organic Synthesis", "Protein Purification", "DNA Sequencing",
  "Histology", "Animal Handling (Research)", "Field Sampling",
  "Environmental Monitoring", "Soil Analysis", "Water Quality Testing",
  "Astronomy Observation", "Telescope Operation", "Clinical Data Collection",
  // ── Research & academic
  "Literature Review", "Research Design", "Survey Design",
  "Qualitative Research", "Quantitative Research", "Statistical Modeling",
  "SPSS", "Stata", "NVivo", "Systematic Review", "Meta-Analysis",
  "Academic Writing", "Grant Writing", "Scientific Writing",
  "Peer Review", "Conference Presentation", "Poster Design (Academic)",
  "Research Ethics / IRB", "Data Ethics", "Citation Management (Zotero/EndNote)",
  "LaTeX", "Archival Research", "Ethnography", "Policy Analysis",
  "Economic Modeling", "Econometrics", "Epidemiological Methods",
  // ── Design & creative
  "UI Design", "UX Design", "UX Research", "Figma", "Adobe Photoshop",
  "Adobe Illustrator", "Adobe InDesign", "Adobe Premiere Pro",
  "Adobe After Effects", "Video Editing", "Motion Graphics", "Animation",
  "3D Modeling (Blender)", "Unity", "Unreal Engine", "Game Design",
  "Graphic Design", "Brand Design", "Typography", "Illustration",
  "Photography", "Videography", "Sound Design", "Music Production",
  "Audio Engineering", "Podcast Production", "Creative Writing",
  "Screenwriting", "Copywriting", "Technical Writing", "Journalism",
  "Editing & Proofreading", "Storyboarding", "Fashion Design",
  "Interior Design", "Architecture Drafting",
  // ── Business, finance & entrepreneurship
  "Financial Modeling", "Valuation", "Accounting", "Bookkeeping",
  "Financial Analysis", "Investment Research", "Portfolio Management",
  "Trading", "Risk Analysis", "Business Strategy", "Market Research",
  "Competitive Analysis", "Business Development", "Sales",
  "Customer Discovery", "Pitch Deck Design", "Fundraising",
  "Venture Capital Analysis", "Product Management", "Product Strategy",
  "Project Management", "Agile / Scrum", "Operations Management",
  "Supply Chain Management", "Logistics", "Procurement", "Lean Six Sigma",
  "Quality Assurance", "Entrepreneurship", "E-commerce", "Digital Marketing",
  "Social Media Marketing", "Content Marketing", "Email Marketing",
  "Growth Marketing", "Marketing Analytics", "Google Analytics",
  "Paid Advertising (PPC)", "Public Relations", "Event Planning",
  "Customer Service", "CRM (Salesforce)", "Negotiation", "Consulting",
  "Case Analysis", "QuickBooks", "SAP",
  // ── Civic, legal & policy
  "Legal Research", "Legal Writing", "Moot Court / Mock Trial",
  "Contract Review", "Policy Research", "Legislative Analysis",
  "Public Speaking", "Debate", "Model UN", "Community Organizing",
  "Advocacy", "Lobbying", "Nonprofit Management", "Volunteer Coordination",
  "Fundraising (Nonprofit)", "Program Evaluation", "International Relations Analysis",
  // ── Health & care
  "First Aid / CPR", "Patient Care", "Medical Scribing", "Phlebotomy",
  "EMT Skills", "Health Education", "Public Health Outreach",
  "Mental Health First Aid", "Nutrition Planning", "Athletic Training",
  "Medical Terminology", "Clinical Research Coordination", "Telehealth Support",
  // ── Education & languages
  "Teaching", "Tutoring", "Curriculum Design", "Instructional Design",
  "Mentoring", "Coaching", "Workshop Facilitation", "Translation",
  "Interpretation", "Sign Language (ASL)", "TESOL / Language Teaching",
  // ── Leadership & collaboration
  "Team Leadership", "Cross-functional Collaboration", "Conflict Resolution",
  "Strategic Planning", "Budget Management", "Recruiting & Hiring",
  "Board Governance", "Stakeholder Management", "Time Management",
  "Problem Solving", "Critical Thinking",
] as const;
