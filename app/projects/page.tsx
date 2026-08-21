import { Plus } from "lucide-react";
import { ProductShell } from "../components/product-shell";
import { ProjectsManager } from "../components/projects-manager";

export default function ProjectsPage(){return <ProductShell active="projects" title="Projects" context="YOUR WORK" actions={<a className="header-primary" href="/project/new"><Plus size={15}/> Quick build</a>}><ProjectsManager/></ProductShell>}
